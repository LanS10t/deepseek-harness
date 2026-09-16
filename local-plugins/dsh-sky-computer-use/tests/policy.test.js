import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopController, allowedApp, validateConfig } from '../policy.js';
import { validateAction } from '../protocol.js';
import { prepareObservation, renderResult } from '../images.js';

const signal = () => new AbortController().signal;
const base = () => ({
  mode: 'ask', allowedApps: ['test.exe'], allowAllApps: false, packagePath: '/sky',
  expectedVersion: '0.6.32', observationTtlMs: 60000, callTimeoutMs: 30000, stopEpoch: 0,
});
const window = { id: 1, app: 'test.exe', title: 'Test' };
const image = 'data:image/png;base64,aGVsbG8=';
function fixture() {
  let config = base();
  let time = 0;
  const calls = [];
  const approvals = [];
  const runtime = {
    async call(_config, operation, args) {
      calls.push({ operation, args });
      if (operation === 'list_windows') return [window, { id: 2, app: 'other.exe' }];
      if (operation === 'get_window_state') return {
        window, accessibility: { tree: '[1] input', focused_element: '[1] input' },
        screenshots: [{ id: 's1', url: image, width: 100, height: 100, zIndex: 0 }],
      };
      return null;
    },
    async stop() { calls.push({ operation: 'stop' }); },
    status: () => 'fake',
  };
  const desktop = new DesktopController({
    config: () => config, runtime, now: () => time,
    approve: async (...args) => { approvals.push(args); return 'allowed-once'; },
  });
  const run = (operation, args = {}, owner = 'a') => desktop.run(owner, operation, args, signal());
  const observe = async () => {
    const [selected] = await run('list_windows');
    return await run('observe', { windowId: selected.windowId });
  };
  return {
    desktop, run, observe, calls, approvals, runtime,
    configure: changes => { config = { ...config, ...changes }; },
    tick: value => { time = value; },
  };
}
const action = observation => ({
  windowId: observation.windowId, observationId: observation.observationId,
  input: { text: '中文验收' }, purpose: '输入验收文本', risk: 'ordinary',
});

test('exact allowlist and mandatory blocked target checks survive full scope', () => {
  assert.equal(allowedApp(base(), 'test.exe'), true);
  assert.equal(allowedApp(base(), 'C:\\fake\\test.exe'), false);
  assert.equal(allowedApp({ ...base(), allowAllApps: true }, 'C:\\Windows\\System32\\cmd.exe'), false);
  assert.equal(allowedApp({ ...base(), allowAllApps: true }, 'Codex.exe'), false);
  assert.throws(() => validateConfig({ ...base(), allowedApps: ['*'] }));
});

test('fixed action parser refuses extra arguments and ambiguous coordinates', () => {
  assert.throws(() => validateAction('eval', {}));
  assert.throws(() => validateAction('type_text', { text: 'x', window: {} }));
  assert.throws(() => validateAction('click', { x: 1, y: 2 }));
  assert.throws(() => validateAction('click', { element_index: 1, x: 1 }));
  assert.throws(() => validateAction('press_key', { key: 'Win+r' }));
  assert.throws(() => validateAction('scroll', { x: NaN, y: 0 }));
  assert.deepEqual(validateAction('click', { element_index: 1 }), { element_index: 1 });
});

test('disabled blocks enumeration and read-only blocks state changes', async () => {
  const f = fixture();
  f.configure({ mode: 'disabled' });
  await assert.rejects(f.run('list_windows'), /disabled/);
  assert.equal(f.calls.length, 0);
  f.configure({ mode: 'read-only' });
  const observation = await f.observe();
  await assert.rejects(f.run('type_text', action(observation)), /Read-only/);
  assert.equal(f.approvals.length, 0);
  await assert.rejects(f.run('launch_app', { app: 'test.exe', risk: 'ordinary', purpose: 'Open' }), /Read-only/);
});

test('one approval permits one input and immediate refresh; old observation cannot replay', async () => {
  const f = fixture();
  const observation = await f.observe();
  const next = await f.run('type_text', action(observation));
  assert.notEqual(next.observationId, observation.observationId);
  assert.equal(f.approvals.length, 1);
  assert.deepEqual(f.calls.slice(-3).map(call => call.operation), ['type_text', 'list_windows', 'get_window_state']);
  await assert.rejects(f.run('type_text', action(observation)), /stale/);
  assert.equal(f.calls.filter(call => call.operation === 'type_text').length, 1);
});

test('cross-session windows, stale observations and screenshot coordinates fail closed', async () => {
  const f = fixture();
  let observation = await f.observe();
  await assert.rejects(f.run('observe', { windowId: observation.windowId }, 'b'), /cross-session/);
  observation = await f.observe();
  await assert.rejects(f.run('click', { ...action(observation), input: { x: 101, y: 1, screenshotId: 's1' } }), /bounds/);
  observation = await f.observe();
  f.tick(60001);
  await assert.rejects(f.run('type_text', action(observation)), /stale/);
});

test('refused, unavailable and cancelled approvals never dispatch input', async () => {
  for (const outcome of ['rejected', 'unavailable', 'cancelled']) {
    const f = fixture();
    f.desktop.approve = async () => outcome;
    const observation = await f.observe();
    await assert.rejects(f.run('type_text', action(observation)), new RegExp(outcome));
    assert.equal(f.calls.some(call => call.operation === 'type_text'), false);
  }
});

test('permission is rechecked after approval, including unchanged-to-disabled writes', async () => {
  const f = fixture();
  const observation = await f.observe();
  f.desktop.approve = async () => { f.configure({ mode: 'disabled' }); return 'allowed-once'; };
  await assert.rejects(f.run('type_text', action(observation)), /disabled/);
  assert.equal(f.calls.some(call => call.operation === 'type_text'), false);
});

test('full mode skips ordinary asks but retains sensitive action confirmation', async () => {
  const f = fixture();
  f.configure({ mode: 'full' });
  let observation = await f.observe();
  observation = await f.run('type_text', action(observation));
  assert.equal(f.approvals.length, 0);
  await f.run('type_text', { ...action(observation), risk: 'sensitive' });
  assert.equal(f.approvals.length, 1);
});

test('busy executor rejects competing sessions and stop cancels an approval', async () => {
  const f = fixture();
  const observation = await f.observe();
  f.desktop.approve = async (_owner, _op, _args, abort) => new Promise(resolve => {
    abort.addEventListener('abort', () => resolve('cancelled'), { once: true });
  });
  const pending = f.run('type_text', action(observation));
  await assert.rejects(f.run('list_windows', {}, 'b'), /busy/);
  await f.desktop.stop();
  await assert.rejects(pending);
  assert.equal(f.calls.some(call => call.operation === 'type_text'), false);
  await assert.rejects(f.run('list_windows'), /disabled/);
});

test('unknown input outcome consumes the observation and never retries', async () => {
  const f = fixture();
  const observation = await f.observe();
  const original = f.runtime.call;
  f.runtime.call = async (...args) => {
    if (args[1] === 'type_text') throw new Error('Transport failed');
    return original(...args);
  };
  await assert.rejects(f.run('type_text', action(observation)), /outcome is unknown/);
  await assert.rejects(f.run('type_text', action(observation)), /stale/);
});

test('a late settings callback cannot undo a newer explicit stop', async () => {
  const f = fixture();
  let release;
  f.runtime.stop = () => new Promise(resolve => { release = resolve; });
  const first = f.desktop.changed();
  const releaseFirst = release;
  const second = f.desktop.stop();
  release();
  await second;
  releaseFirst();
  await first;
  assert.equal(f.desktop.status().stopped, true);
  await assert.rejects(f.run('list_windows'), /disabled/);
});

test('caller cancellation while awaiting approval also closes the idle worker', async () => {
  const f = fixture();
  const observation = await f.observe();
  const controller = new AbortController();
  f.desktop.approve = async (_owner, _op, _args, abort) => new Promise(resolve => {
    abort.addEventListener('abort', () => resolve('cancelled'), { once: true });
  });
  const pending = f.desktop.run('a', 'type_text', action(observation), controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(f.calls.at(-1).operation, 'stop');
  assert.equal(f.desktop.active, null);
});

test('stop forwards cancellation to result preparation and waits for that work to settle', async () => {
  const f = fixture();
  const [selected] = await f.run('list_windows');
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let resultSignal;
  const pending = f.desktop.run('a', 'observe', { windowId: selected.windowId }, signal(),
    async (_value, combined) => {
      resultSignal = combined;
      entered();
      await gate;
      combined.throwIfAborted();
      throw new Error('Preparation must not continue after cancellation');
    });
  const outcome = pending.catch(error => error);
  await started;
  let stopped = false;
  const stop = f.desktop.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(resultSignal.aborted, true);
  assert.equal(stopped, false);
  release();
  await stop;
  assert.equal((await outcome).name, 'AbortError');
  assert.equal(f.desktop.active, null);
});

test('screenshots are durably admitted and encoded bytes never enter text projection', async () => {
  const saved = [];
  const state = {
    windowId: 'w', observationId: 'o', window, accessibility: { tree: '中文' },
    screenshots: [{ id: 's1', url: image }],
  };
  const store = { async saveImages(images) { saved.push(...images); return [{ id: 'image1', mediaType: 'image/png' }]; } };
  const value = await prepareObservation(state, store, true, signal());
  assert.equal(saved[0].data.toString(), 'hello');
  assert.equal(renderResult({}, value)[1].type, 'image');
  assert.equal(JSON.stringify(value).includes('aGVsbG8'), false);
  const textOnly = await prepareObservation(state, store, false, signal());
  assert.equal(renderResult({}, textOnly).length, 1);
  assert.match(textOnly.notice, /UIA/);
  await assert.rejects(prepareObservation({ ...state, screenshots: [{ url: 'https://image' }] }, store, true, signal()), /Invalid/);
});
