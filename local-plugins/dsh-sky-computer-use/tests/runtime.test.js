import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SkyRuntime } from '../runtime.js';

const config = {
  packagePath: fileURLToPath(new URL('./fixtures/sky', import.meta.url)),
  expectedVersion: '0.0.0-test',
  callTimeoutMs: 5000,
};
const signal = () => new AbortController().signal;
const isolatedRuntime = options => new SkyRuntime({ ...options, safety: { poisoned: false } });

test('plain Node public export supports repeated requests and acknowledged shutdown', async () => {
  const runtime = isolatedRuntime();
  try {
    assert.equal((await runtime.call(config, 'list_windows', {}, signal()))[0].app, 'test.exe');
    assert.equal((await runtime.call(config, 'list_apps', {}, signal()))[0].id, 'test.exe');
    assert.equal(runtime.status(), 'ready');
    await assert.rejects(runtime.call(config, 'eval', { source: 'process.exit()' }, signal()), /Invalid native window|Unsupported/);
  } finally {
    await runtime.stop();
  }
  assert.equal(runtime.status(), 'stopped');
});

test('missing package, version drift and malformed action reject without falling back', async () => {
  const runtime = isolatedRuntime();
  try {
    await assert.rejects(runtime.call({ ...config, packagePath: `${config.packagePath}/missing` }, 'list_windows', {}, signal()), /ENOENT/);
    await assert.rejects(runtime.call({ ...config, expectedVersion: '1.0.0' }, 'list_windows', {}, signal()), /revalidation/);
    await assert.rejects(runtime.call(config, 'type_text', { text: 1, window: { id: 1, app: 'test.exe' } }, signal()), /Invalid action/);
  } finally { await runtime.stop(); }
});

test('native authorization refusal remains a refusal', async () => {
  const runtime = isolatedRuntime();
  try {
    await assert.rejects(runtime.call(config, 'launch_app', { app: 'denied.exe' }, signal()), /elicitations are unavailable/);
  } finally { await runtime.stop(); }
});

test('timeout and abort close the owned worker before returning', async () => {
  for (const mode of ['timeout', 'abort']) {
    const runtime = isolatedRuntime();
    try {
      await runtime.call(config, 'list_windows', {}, signal());
      const controller = new AbortController();
      const pending = runtime.call({ ...config, callTimeoutMs: 100 }, 'launch_app', { app: 'hang.exe' }, controller.signal);
      if (mode === 'abort') controller.abort();
      await assert.rejects(pending);
      // An abort before dispatch may leave an idle worker; it must not retain work.
      await runtime.stop();
      assert.equal(runtime.child, null);
    } finally { await runtime.stop(); }
  }
});

test('unexpected process exit permanently refuses further desktop actions', async () => {
  const runtime = isolatedRuntime();
  try {
    await assert.rejects(runtime.call(config, 'launch_app', { app: 'exit.exe' }, signal()), /exited/);
    assert.equal(runtime.status(), 'unavailable-restart-required');
    await assert.rejects(runtime.call(config, 'list_windows', {}, signal()), /restart/);
  } finally { await runtime.stop(); }
});

test('unacknowledged forced stop is unavailable even when the worker exits', async () => {
  const runtime = isolatedRuntime({ shutdownTimeoutMs: 100 });
  try {
    await runtime.call(config, 'list_windows', {}, signal());
    await assert.rejects(runtime.call({ ...config, callTimeoutMs: 100 }, 'launch_app', { app: 'hung-close.exe' }, signal()));
    assert.equal(runtime.status(), 'unavailable-restart-required');
  } finally { await runtime.stop(); }
});

test('shutdown waits for initialization and closes the newly created native client', async () => {
  const runtime = isolatedRuntime({ shutdownTimeoutMs: 1500 });
  try {
    const controller = new AbortController();
    const pending = runtime.call({
      ...config, packagePath: fileURLToPath(new URL('./fixtures/slow-sky', import.meta.url)),
    }, 'list_windows', {}, controller.signal);
    setTimeout(() => controller.abort(), 70);
    await assert.rejects(pending);
    assert.equal(runtime.child, null);
    assert.equal(runtime.status(), 'stopped');
    assert.equal(runtime.closedAck, true);
  } finally { await runtime.stop(); }
});

test('a late success cannot win cancellation or return before the worker closes', async () => {
  const runtime = isolatedRuntime({ worker: new URL('./fixtures/late-worker.js', import.meta.url) });
  try {
    await runtime.start(config, signal());
    const controller = new AbortController();
    const pending = runtime.call(config, 'list_windows', {}, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await assert.rejects(pending, /cancelled/);
    assert.equal(runtime.child, null);
    assert.equal(runtime.status(), 'stopped');
  } finally { await runtime.stop(); }
});

test('unconfirmed native stop survives construction of a replacement runtime in the same process', async () => {
  const original = new SkyRuntime({ shutdownTimeoutMs: 100 });
  try {
    await original.start(config, signal());
    await assert.rejects(original.call({ ...config, callTimeoutMs: 100 }, 'launch_app', { app: 'hung-close.exe' }, signal()));
    const replacement = new SkyRuntime();
    assert.equal(replacement.status(), 'unavailable-restart-required');
    await assert.rejects(replacement.call(config, 'list_windows', {}, signal()), /restart/);
    assert.equal(replacement.child, null);
  } finally { await original.stop(); }
});
