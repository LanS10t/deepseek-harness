/**
 * Independent client/adapter tests. Run from the repository root:
 * node --test local-plugins/dsh-sky-computer-use/tests/client.test.mjs
 *
 * React and its renderer are resolved from the existing DSH host, not bundled.
 * The scope double reproduces revision fencing and non-throwing refusal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const hostRequire = createRequire(new URL('../../../packages/client/ui-renderer/package.json', import.meta.url));
const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const React = hostRequire('react');
const { renderToStaticMarkup } = hostRequire('react-dom/server');
const { JSDOM } = rootRequire('jsdom');
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const trustedEvent = () => ({ nativeEvent: { isTrusted: true } });
const plain = value => JSON.parse(JSON.stringify(value));
const initial = () => ({
  mode: 'ask',
  allowedApps: ['notepad.exe'],
  allowAllApps: false,
  packagePath: 'D:\\runtime\\sky',
  expectedVersion: '1.0.0',
  observationTtlMs: 30000,
  callTimeoutMs: 60000,
  stopEpoch: 4,
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function scopeDouble(value = initial()) {
  let snapshot = {
    status: 'ready', mode: 'host', writable: true, revision: 7,
    value: structuredClone(value), base: structuredClone(value), user: {},
  };
  const listeners = new Set();
  const scope = {
    calls: [],
    behavior: undefined,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
    replace(patch) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    },
    external(patch) {
      scope.replace({
        value: { ...snapshot.value, ...patch },
        user: { ...snapshot.user, ...patch },
        revision: snapshot.revision + 1,
      });
    },
    accept(ops, revision) {
      if (revision !== snapshot.revision) return;
      const changed = Object.fromEntries(ops.map(({ path: [field], value }) => [field, structuredClone(value)]));
      scope.replace({
        value: { ...snapshot.value, ...changed },
        user: { ...snapshot.user, ...changed },
        revision: snapshot.revision + 1,
      });
    },
    async mutate(ops, revision) {
      const owned = plain(ops);
      scope.calls.push({ ops: owned, revision });
      if (scope.behavior) return scope.behavior(owned, revision);
      scope.accept(owned, revision);
    },
  };
  return scope;
}

function harness(scope = scopeDouble()) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const registrations = [];
  const imports = [];
  const dialogs = [];
  const disposers = [];
  const handlers = new Map();
  const dictionaries = new Map();
  let confirmed = true;
  let dialogError;
  let slot;
  let module;
  dom.window.__ModuleLoader__ = { load: registration => registrations.push(registration) };
  dom.window.confirm = message => {
    dialogs.push(message);
    if (dialogError) throw dialogError;
    return confirmed;
  };
  vm.runInNewContext(source, { window: dom.window, document: dom.window.document });
  const ctx = {
    effect(callback) {
      const dispose = callback();
      if (dispose) disposers.push(dispose);
    },
    on(name, callback) {
      handlers.set(name, callback);
      return () => handlers.delete(name);
    },
    locale: {
      register(namespace, dictionary) {
        dictionaries.set(namespace, dictionary);
        return () => dictionaries.delete(namespace);
      },
      bind(namespace) {
        return key => {
          const text = dictionaries.get(namespace)?.zh[key];
          assert.equal(typeof text, 'string', `Unknown locale key: ${key}`);
          return text;
        };
      },
    },
    settingsScope: {
      bind(spec) {
        assert.deepEqual(plain(spec), { namespace: 'sky-computer-use' });
        return scope;
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.plugin.item');
        const off = callback();
        if (off) disposers.push(off);
      },
      register(options, component) {
        slot = { options, component };
        return () => { slot = undefined; };
      },
    },
  };
  const api = {
    scope, dom, registrations, imports, dialogs, dictionaries,
    materialize() {
      module = registrations[0].factory(name => {
        imports.push(name);
        assert.equal(name, 'react', 'Only host React may be imported');
        return React;
      });
      return module;
    },
    apply() {
      if (!module) api.materialize();
      module.apply(ctx);
      return api;
    },
    get slot() { return slot; },
    get face() { return slot.options.inject(); },
    state: () => api.face.hooks.skyComputerUse.getSnapshot(),
    confirm(value) { confirmed = value; },
    breakDialog() { dialogError = new Error('Dialog blocked'); },
    resetConnection() { handlers.get('connection/reset')(); },
    dispose() {
      for (const dispose of disposers.reverse()) dispose();
      dom.window.close();
    },
    html() {
      const face = api.face;
      return renderToStaticMarkup(React.createElement(slot.component, {
        ...face,
        t: ctx.locale.bind(slot.options.locale),
        useSkyComputerUse: select => select(face.hooks.skyComputerUse.getSnapshot()),
      }));
    },
  };
  return api;
}

function setup(t, scope) {
  const app = harness(scope).apply();
  t.after(() => app.dispose());
  return app;
}

test('factory is lazy, has the package id, and imports only host React', t => {
  const app = harness();
  t.after(() => app.dispose());
  assert.equal(app.registrations.length, 1);
  assert.equal(app.registrations[0].id, 'dsh-sky-computer-use');
  assert.equal(app.dom.window.document.querySelectorAll('style').length, 0);
  assert.deepEqual(app.imports, []);
  const module = app.materialize();
  assert.deepEqual(Object.keys(module).sort(), ['apply', 'inject']);
  assert.deepEqual(plain(module.inject), ['slots', 'locale', 'connection', 'settingsScope']);
  assert.deepEqual(app.imports, ['react']);
  assert.equal(app.dom.window.document.querySelector('style').dataset.plugin, app.registrations[0].id);
  app.apply();
  assert.equal(app.slot.options.key, 'sky-computer-use');
  assert.equal(app.slot.options.locale, 'settings.skyComputerUse');
  assert.equal(app.scope.listenerCount(), 1);
});

test('stages every editable field, deduplicates lines, and saves once with the read revision', async t => {
  const app = setup(t);
  const face = app.face;
  face.edit('mode', 'read-only');
  face.edit('allowedApps', ' notepad.exe \r\n\r\n calculator.exe\nnotepad.exe ');
  face.edit('allowAllApps', true);
  face.edit('packagePath', ' D:\\运行时\\sky ');
  face.edit('expectedVersion', ' 2.4.0 ');
  face.edit('observationTtlMs', '12000');
  face.edit('callTimeoutMs', '45000');
  assert.equal(app.scope.calls.length, 0);
  await face.save(trustedEvent());
  assert.equal(app.scope.calls.length, 1);
  assert.equal(app.scope.calls[0].revision, 7);
  assert.deepEqual(app.scope.getSnapshot().value, {
    mode: 'read-only', allowedApps: ['notepad.exe', 'calculator.exe'], allowAllApps: true,
    packagePath: 'D:\\运行时\\sky', expectedVersion: '2.4.0',
    observationTtlMs: 12000, callTimeoutMs: 45000, stopEpoch: 4,
  });
  assert.equal(app.scope.calls[0].ops.some(op => op.path[0] === 'stopEpoch'), false);
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.state().message, 'saved');
  assert.equal(app.state().dirty, false);
});

test('empty allowlist is stored as [] and blank runtime strings are explicit values', async t => {
  const app = setup(t);
  app.face.edit('allowedApps', ' \n\r\n');
  app.face.edit('packagePath', ' ');
  app.face.edit('expectedVersion', '');
  await app.face.save(trustedEvent());
  assert.deepEqual(app.scope.getSnapshot().user, { allowedApps: [], packagePath: '', expectedVersion: '' });
  assert.equal(app.state().error, undefined);
});

test('discard and an unchanged draft never write', async t => {
  const app = setup(t);
  app.face.edit('mode', 'ask');
  await app.face.save(trustedEvent());
  assert.equal(app.state().dirty, false);
  app.face.edit('packagePath', 'changed');
  app.face.discard();
  assert.equal(app.state().draft.packagePath, initial().packagePath);
  assert.equal(app.scope.calls.length, 0);
});

test('stopEpoch and unknown fields are not editable', async t => {
  const app = setup(t);
  app.face.edit('stopEpoch', 999);
  app.face.edit('__proto__', {});
  await app.face.save(trustedEvent());
  assert.equal(app.scope.calls.length, 0);
  assert.equal(app.state().stopEpoch, 4);
});

for (const bad of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
  test(`invalid duration ${JSON.stringify(bad)} blocks atomic saving`, async t => {
    const app = setup(t);
    app.face.edit('observationTtlMs', bad);
    app.face.edit('packagePath', 'must-not-save');
    await app.face.save(trustedEvent());
    assert.equal(app.scope.calls.length, 0);
    assert.equal(app.state().error, 'invalid');
    assert.deepEqual(plain(app.state().invalidFields), ['observationTtlMs']);
  });
}

for (const patch of [
  { status: 'loading', value: undefined },
  { status: 'unavailable' },
  { writable: false },
  { mode: 'memory' },
  { revision: undefined },
]) {
  test(`unwritable snapshot ${JSON.stringify(patch)} cannot save or stop`, async t => {
    const scope = scopeDouble();
    scope.replace(patch);
    const app = setup(t, scope);
    app.face.edit('mode', 'full');
    await app.face.save(trustedEvent());
    await app.face.stop(trustedEvent());
    assert.equal(scope.calls.length, 0);
    assert.equal(app.state().writable, false);
  });
}

test('a changed revision preserves drafts and blocks overwriting unrelated updates', async t => {
  const app = setup(t);
  app.face.edit('mode', 'read-only');
  app.scope.external({ callTimeoutMs: 80000 });
  await app.face.save(trustedEvent());
  assert.equal(app.state().conflicted, true);
  assert.equal(app.state().draft.mode, 'read-only');
  assert.equal(app.scope.calls.length, 0);
  app.face.discard();
  assert.equal(app.state().conflicted, false);
  assert.equal(app.state().draft.callTimeoutMs, '80000');
  app.face.edit('mode', 'disabled');
  await app.face.save(trustedEvent());
  assert.equal(app.scope.calls[0].revision, 8);
});

test('scope snapshots update the card without a draft and keep store references stable', t => {
  const app = setup(t);
  const store = app.face.hooks.skyComputerUse;
  assert.equal(store.getSnapshot(), store.getSnapshot());
  let count = 0;
  const off = store.subscribe(() => { count += 1; });
  app.scope.external({ mode: 'read-only' });
  assert.equal(app.state().draft.mode, 'read-only');
  assert.equal(count, 1);
  off();
  app.scope.external({ mode: 'disabled' });
  assert.equal(count, 1);
});

for (const thrown of [false, true]) {
  test(`save refusal ${thrown ? 'with rejection' : 'without rejection'} preserves drafts and reports failure`, async t => {
    const app = setup(t);
    app.scope.behavior = async () => {
      if (thrown) throw new Error('Transport down');
    };
    app.face.edit('mode', 'read-only');
    await app.face.save(trustedEvent());
    assert.equal(app.state().saving, false);
    assert.equal(app.state().dirty, true);
    assert.equal(app.state().error, 'saveFailed');
    app.scope.behavior = undefined;
    await app.face.save(trustedEvent());
    assert.equal(app.state().message, 'saved');
  });
}

test('readback needs a newer revision and raw user-layer presence, not only an effective value', async t => {
  const app = setup(t);
  app.scope.behavior = async () => {
    app.scope.replace({ value: { ...initial(), mode: 'disabled' } });
  };
  app.face.edit('mode', 'disabled');
  await app.face.save(trustedEvent());
  assert.equal(app.state().error, 'saveFailed');
  assert.equal(Object.hasOwn(app.scope.getSnapshot().user, 'mode'), false);
});

test('a race at the wire is refused using the original draft revision', async t => {
  const app = setup(t);
  const gate = deferred();
  app.scope.behavior = async (ops, revision) => {
    await gate.promise;
    app.scope.accept(ops, revision);
  };
  app.face.edit('mode', 'full');
  const saving = app.face.save(trustedEvent());
  app.scope.external({ mode: 'disabled', stopEpoch: 5 });
  gate.resolve();
  await saving;
  assert.equal(app.scope.getSnapshot().value.mode, 'disabled');
  assert.equal(app.state().conflicted, true);
  assert.equal(app.state().error, 'saveFailed');
});

test('synthetic/missing actions cannot write or open the authorization dialog', async t => {
  const app = setup(t);
  app.face.edit('mode', 'full');
  await app.face.save();
  await app.face.save({ nativeEvent: { isTrusted: false } });
  await app.face.stop({ isTrusted: false });
  assert.equal(app.dialogs.length, 0);
  assert.equal(app.scope.calls.length, 0);
  assert.equal(app.state().error, 'untrusted');
});

test('native full-access confirmation cancellation retains the staged choice without writing', async t => {
  const app = setup(t);
  app.confirm(false);
  app.face.edit('mode', 'full');
  await app.face.save(trustedEvent());
  assert.equal(app.dialogs.length, 1);
  assert.match(app.dialogs[0], /完全授权/);
  assert.equal(app.scope.calls.length, 0);
  assert.equal(app.state().message, 'cancelled');
  assert.equal(app.state().draft.mode, 'full');
  app.confirm(true);
  await app.face.save(trustedEvent());
  assert.equal(app.scope.getSnapshot().value.mode, 'full');
  assert.equal(app.dialogs.length, 2);
});

test('an unavailable confirmation dialog refuses full access', async t => {
  const app = setup(t);
  app.breakDialog();
  app.face.edit('mode', 'full');
  await app.face.save(trustedEvent());
  assert.equal(app.scope.calls.length, 0);
  assert.equal(app.state().error, 'confirmFailed');
});

test('runtime changes under existing full access require a new user confirmation', async t => {
  const app = setup(t, scopeDouble({ ...initial(), mode: 'full' }));
  app.confirm(false);
  app.face.edit('packagePath', 'another-runtime');
  await app.face.save(trustedEvent());
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.scope.calls.length, 0);
});

test('ordinary restricted-mode saves do not ask for full-access confirmation', async t => {
  const app = setup(t);
  app.face.edit('mode', 'read-only');
  await app.face.save(trustedEvent());
  assert.equal(app.dialogs.length, 0);
});

test('emergency stop bypasses invalid drafts and authorization, and increments stopEpoch atomically', async t => {
  const app = setup(t, scopeDouble({ ...initial(), mode: 'full' }));
  app.confirm(false);
  app.face.edit('callTimeoutMs', 'invalid');
  app.face.edit('allowedApps', 'must-not-save');
  await app.face.stop(trustedEvent());
  assert.deepEqual(app.scope.calls, [{
    revision: 7,
    ops: [
      { op: 'set', path: ['mode'], value: 'disabled' },
      { op: 'set', path: ['stopEpoch'], value: 5 },
    ],
  }]);
  assert.equal(app.state().dirty, false);
  assert.equal(app.state().message, 'stopped');
  assert.equal(app.scope.getSnapshot().value.callTimeoutMs, 60000);
  assert.equal(app.dialogs.length, 0);
  await app.face.stop(trustedEvent());
  assert.equal(app.scope.getSnapshot().value.stopEpoch, 6);
});

test('emergency stop queues behind an in-flight full-access save and cannot be overtaken', async t => {
  const app = setup(t);
  const gate = deferred();
  app.scope.behavior = async (ops, revision) => {
    if (app.scope.calls.length === 1) await gate.promise;
    app.scope.accept(ops, revision);
  };
  app.face.edit('mode', 'full');
  const saving = app.face.save(trustedEvent());
  const stopping = app.face.stop(trustedEvent());
  assert.equal(app.state().stopping, true);
  app.face.edit('mode', 'full');
  await app.face.save(trustedEvent());
  await app.face.stop(trustedEvent());
  assert.equal(app.scope.calls.length, 1);
  gate.resolve();
  await Promise.all([saving, stopping]);
  assert.deepEqual(app.scope.calls.map(call => call.revision), [7, 8]);
  assert.equal(app.scope.getSnapshot().value.mode, 'disabled');
  assert.equal(app.scope.getSnapshot().value.stopEpoch, 5);
  assert.equal(app.state().draft.mode, 'disabled');
  assert.equal(app.state().dirty, false);
  assert.equal(app.state().message, 'stopped');
});

for (const thrown of [false, true]) {
  test(`failed emergency stop ${thrown ? 'rejects' : 'resolves'} without claiming success`, async t => {
    const app = setup(t);
    app.scope.behavior = async () => {
      if (thrown) throw new Error('offline');
    };
    await app.face.stop(trustedEvent());
    assert.equal(app.state().error, 'stopFailed');
    assert.equal(app.state().message, undefined);
    assert.equal(app.state().stopping, false);
  });
}

test('stop counter overflow fails visibly without issuing an invalid mutation', async t => {
  const app = setup(t, scopeDouble({ ...initial(), stopEpoch: Number.MAX_SAFE_INTEGER }));
  await app.face.stop(trustedEvent());
  assert.equal(app.scope.calls.length, 0);
  assert.equal(app.state().error, 'stopFailed');
});

test('reconnection discards permission drafts even if the new host repeats a revision', t => {
  const app = setup(t);
  app.face.edit('mode', 'full');
  app.resetConnection();
  assert.equal(app.state().draft.mode, 'ask');
  assert.equal(app.state().dirty, false);
});

test('reconnection prevents a waiting emergency stop from writing to the next connection', async t => {
  const app = setup(t);
  const gate = deferred();
  app.scope.behavior = async () => gate.promise;
  app.face.edit('mode', 'full');
  const saving = app.face.save(trustedEvent());
  const stopping = app.face.stop(trustedEvent());
  app.resetConnection();
  gate.resolve();
  await Promise.all([saving, stopping]);
  assert.equal(app.scope.calls.length, 1);
  assert.equal(app.state().message, undefined);
  assert.equal(app.state().saving, false);
  assert.equal(app.state().stopping, false);
});

test('disposal removes subscriptions and suppresses pending results and follow-up writes', async () => {
  const app = harness().apply();
  const face = app.face;
  const gate = deferred();
  app.scope.behavior = async () => gate.promise;
  face.edit('mode', 'full');
  const saving = face.save(trustedEvent());
  const stopping = face.stop(trustedEvent());
  let changes = 0;
  face.hooks.skyComputerUse.subscribe(() => { changes += 1; });
  app.dispose();
  assert.equal(app.scope.listenerCount(), 0);
  gate.resolve();
  await Promise.all([saving, stopping]);
  assert.equal(app.scope.calls.length, 1);
  assert.equal(changes, 0);
});

test('React renders Chinese semantic controls, runtime fields, and read-only stop sequence', t => {
  const app = setup(t);
  const dom = new JSDOM(app.html());
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  assert.match(doc.body.textContent, /电脑操作/);
  assert.deepEqual([...doc.querySelectorAll('input[type=radio]')].map(input => input.value),
    ['disabled', 'read-only', 'ask', 'full']);
  assert.equal(doc.querySelector('input[type=radio]:checked').value, 'ask');
  assert.equal(doc.querySelectorAll('textarea').length, 1);
  assert.equal(doc.querySelector('textarea').value, 'notepad.exe');
  assert.equal(doc.querySelector('input[name=packagePath]').value, initial().packagePath);
  assert.equal(doc.querySelector('input[name=expectedVersion]').value, '1.0.0');
  assert.equal(doc.querySelectorAll('input[type=number]').length, 2);
  assert.equal(doc.querySelector('input[name=stopEpoch]'), null);
  assert.match(doc.querySelector('[role=status]').textContent, /停止序号: 4/);
  assert.equal(doc.querySelector('button.sky-save').disabled, true);
  assert.equal(doc.querySelector('button.sky-stop').disabled, false);
  assert.equal(doc.querySelector('svg'), null);
});

test('React exposes validation, conflict and failed-save messages in an alert', async t => {
  const app = setup(t);
  app.face.edit('callTimeoutMs', 'bad');
  let dom = new JSDOM(app.html());
  assert.equal(dom.window.document.querySelector('input[name=callTimeoutMs]').getAttribute('aria-invalid'), 'true');
  assert.match(dom.window.document.querySelector('[role=alert]').textContent, /安全整数/);
  dom.window.close();
  app.face.edit('callTimeoutMs', '70000');
  app.scope.behavior = async () => {};
  await app.face.save(trustedEvent());
  dom = new JSDOM(app.html());
  assert.match(dom.window.document.querySelector('[role=alert]').textContent, /保存失败/);
  dom.window.close();
  app.scope.external({ mode: 'disabled' });
  app.face.edit('callTimeoutMs', '80000');
  dom = new JSDOM(app.html());
  assert.match(dom.window.document.querySelector('[role=alert]').textContent, /版本已变化/);
  assert.equal(dom.window.document.querySelector('button.sky-save').disabled, true);
  dom.window.close();
});

test('React disables writes on read-only connections but keeps the current configuration visible', t => {
  const scope = scopeDouble();
  scope.replace({ writable: false });
  const app = setup(t, scope);
  const dom = new JSDOM(app.html());
  t.after(() => dom.window.close());
  assert.match(dom.window.document.body.textContent, /不允许修改设置/);
  assert.equal(dom.window.document.querySelector('fieldset').disabled, true);
  assert.equal(dom.window.document.querySelector('input[name=packagePath]').disabled, true);
  assert.equal(dom.window.document.querySelector('button.sky-stop').disabled, true);
});

test('React loading/unavailable states are explicit and have no mutation controls', t => {
  const scope = scopeDouble();
  scope.replace({ status: 'loading', value: undefined });
  const app = setup(t, scope);
  assert.match(app.html(), /正在读取配置/);
  assert.doesNotMatch(app.html(), /<button/);
  scope.replace({ status: 'unavailable' });
  assert.match(app.html(), /未提供电脑操作设置/);
});

test('runtime and app text is escaped, with theme variables and responsive compact CSS', t => {
  const app = setup(t);
  const payload = '<img src=x onerror=alert(1)>';
  app.face.edit('allowedApps', payload);
  app.face.edit('packagePath', payload.repeat(20));
  const dom = new JSDOM(app.html());
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.querySelector('img'), null);
  assert.equal(dom.window.document.querySelector('textarea').value, payload);
  const css = app.dom.window.document.querySelector('style').textContent;
  assert.match(css, /var\(--dsw-alias-bg-layer-3\)/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /\d(?:vw|cqw)|linear-gradient|url\(/);
});
