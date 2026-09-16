import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACTIONS, validateAction, validateWindow } from './protocol.js';

let sky;
let busy = false;
let closing = false;
let inFlight = Promise.resolve();

async function initialize(config) {
  if (!isAbsolute(config.packagePath)) throw new Error('Configure an absolute @oai/sky package directory');
  const root = await realpath(config.packagePath);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@oai/sky' || manifest.version !== config.expectedVersion) {
    throw new Error('Sky package name/version changed; explicit revalidation is required');
  }
  const entry = manifest.exports?.['.'];
  if (typeof entry !== 'string') throw new Error('Unsupported Sky public export; revalidate the adapter');
  const path = await realpath(resolve(root, entry));
  const local = relative(root, path);
  if (local.startsWith('..') || isAbsolute(local)) throw new Error('Sky public entry escapes package directory');
  const module = await import(pathToFileURL(path).href);
  sky = module.sky;
  if (sky.target !== 'windows') throw new Error('This adapter requires the Windows Sky client');
  return { version: manifest.version, target: sky.target };
}

async function dispatch(operation, args) {
  if (!sky) throw new Error('Sky worker is not initialized');
  if (operation === 'list_windows') {
    const result = await sky.list_windows();
    result.forEach(validateWindow);
    return result;
  }
  if (operation === 'list_apps') return await sky.list_apps();
  if (operation === 'launch_app') {
    if (typeof args.app !== 'string' || !args.app) throw new Error('Invalid application identifier');
    await sky.launch_app({ app: args.app });
    return null;
  }
  const window = validateWindow(args.window);
  if (operation === 'get_window_state') {
    return await sky.get_window_state({ window, include_text: true, include_screenshot: true });
  }
  if (!Object.hasOwn(ACTIONS, operation)) throw new Error('Unsupported worker request');
  const { window: ignored, ...input } = args;
  validateAction(operation, input);
  await sky[operation]({ ...input, window });
  return null;
}

function send(message) {
  if (process.connected) process.send(message, error => {
    if (error && !closing) void close();
  });
}

async function close() {
  if (closing) return;
  closing = true;
  try {
    // Initialization can create the native client after an import await.
    if (!sky) await inFlight;
    if (sky) {
      if (typeof sky.close !== 'function') throw new Error('Sky client has no public close method');
      await sky.close();
    }
    await inFlight;
    send({ type: 'closed' });
    if (process.connected) process.disconnect();
  } catch (error) {
    send({ type: 'close-error', error: error.message });
  }
}

process.on('message', message => {
  if (message?.type === 'close') return void close();
  if (closing || busy) return send({ id: message?.id, ok: false, error: 'Worker is busy or closing' });
  busy = true;
  inFlight = (async () => {
    try {
      if (typeof message?.id !== 'string' || !['initialize', 'call'].includes(message.type)) throw new Error('Invalid worker request');
      const value = message.type === 'initialize'
        ? await initialize(message.config)
        : await dispatch(message.operation, message.args);
      if (Buffer.byteLength(JSON.stringify(value)) > 32 * 1024 * 1024) throw new Error('Sky response exceeds 32 MiB');
      send({ id: message.id, ok: true, value });
    } catch (error) {
      send({ id: message?.id, ok: false, error: String(error.message).slice(0, 4000) });
    } finally {
      busy = false;
    }
  })();
});

process.on('disconnect', () => {
  if (!closing) void close();
});
