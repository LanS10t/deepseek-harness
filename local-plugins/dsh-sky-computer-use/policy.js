import { randomUUID } from 'node:crypto';
import { validateAction } from './protocol.js';

const BLOCKED = /(^|[\\/:!._\s-])(cmd|powershell|pwsh|windowsterminal|conhost|mintty|wsl|bash|codex|chatgpt|lockapp|credentialuibroker|keepass|1password|bitwarden|sechealthui|securityhealthhost)([\\/:!._\s-]|$)/i;
const BLOCKED_TITLE = /windows security|windows powershell|command prompt|password manager|用户账户控制|Windows 安全中心/i;
const RISK_TEXT = /delete|remove|send|submit|purchase|pay\b|install|password|permission|删除|清空|发送|提交|购买|付款|安装|密码|授权|验证码/i;

/** Exact native application identifiers only; full scope still preserves target denies. */
export function allowedApp(config, app, title = '') {
  return typeof app === 'string' && !BLOCKED.test(app) && !BLOCKED_TITLE.test(title)
    && (config.allowAllApps || config.allowedApps.some(id => id.toLowerCase() === app.toLowerCase()));
}

/** Validate configuration before it can become an execution policy. */
export function validateConfig(config) {
  if (!['disabled', 'read-only', 'ask', 'full'].includes(config.mode)) throw new Error('Invalid authorization mode');
  if (!Array.isArray(config.allowedApps) || config.allowedApps.some(id => typeof id !== 'string' || !id.trim() || id.includes('*'))) {
    throw new Error('Application allowlist requires exact, nonempty identifiers without wildcards');
  }
  if (typeof config.allowAllApps !== 'boolean' || typeof config.packagePath !== 'string' || typeof config.expectedVersion !== 'string') {
    throw new Error('Invalid desktop configuration');
  }
  for (const key of ['observationTtlMs', 'callTimeoutMs']) {
    if (!Number.isInteger(config[key]) || config[key] < 1000 || config[key] > 300000) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isSafeInteger(config.stopEpoch) || config.stopEpoch < 0) throw new Error('Invalid stopEpoch');
}

/** One executor owns the desktop; observations cannot cross sessions or survive interleaving. */
export class DesktopController {
  constructor({ config, runtime, approve, now = Date.now }) {
    this.config = config;
    this.runtime = runtime;
    this.approve = approve;
    this.now = now;
    this.windows = new Map();
    this.observation = null;
    this.active = null;
    this.lastError = null;
    this.stopped = false;
    this.stopGeneration = 0;
  }

  status() {
    return {
      mode: this.config().mode, busy: this.active !== null, stopped: this.stopped,
      worker: this.runtime.status(), lastError: this.lastError,
      nativeApproval: 'Native app approval remains required; this plugin cannot grant it.',
    };
  }

  async stop() {
    this.stopGeneration += 1;
    this.stopped = true;
    this.observation = null;
    this.windows.clear();
    this.active?.abort();
    await this.runtime.stop();
  }

  async changed() {
    const stopping = this.stop();
    const generation = this.stopGeneration;
    await stopping;
    if (generation === this.stopGeneration && this.config().mode !== 'disabled') this.stopped = false;
  }

  check(stamp, signal, app, title) {
    signal.throwIfAborted();
    const config = this.config();
    validateConfig(config);
    if (this.stopped || config.mode === 'disabled') throw new Error('Computer Use is disabled');
    if (JSON.stringify(config) !== stamp) throw new Error('Desktop permissions changed; observe again');
    if (app !== undefined && !allowedApp(config, app, title)) throw new Error('Application is outside the allowed scope');
    return config;
  }

  async run(owner, operation, args, signal, prepare = async value => value) {
    if (operation === 'status') return this.status();
    if (!owner) throw new Error('Computer Use requires a DSH session');
    if (this.active) throw new Error('Desktop executor is busy; no action was queued');
    const controller = new AbortController();
    this.active = controller;
    const combined = AbortSignal.any([signal, controller.signal]);
    const stamp = JSON.stringify(this.config());
    try {
      const config = this.check(stamp, combined);
      const call = (method, input) => {
        this.check(stamp, combined);
        return this.runtime.call(config, method, input, combined);
      };
      if (operation === 'list_windows' || operation === 'list_apps') {
        this.observation = null;
        this.windows.clear();
        const rows = await call(operation, {});
        this.check(stamp, combined);
        const remember = window => {
          if (!allowedApp(config, window.app, window.title)) return null;
          const id = randomUUID();
          this.windows.set(id, { owner, window });
          return { windowId: id, app: window.app, title: window.title ?? '' };
        };
        return operation === 'list_windows'
          ? rows.map(remember).filter(Boolean)
          : rows.filter(app => allowedApp(config, app.id)).map(app => ({
            app: app.id, displayName: app.displayName ?? '', isRunning: app.isRunning ?? false,
            windows: app.windows.map(remember).filter(Boolean),
          }));
      }
      if (operation === 'launch_app') {
        this.observation = null;
        this.check(stamp, combined, args.app);
        await this.authorize(owner, operation, args, config, combined);
        this.check(stamp, combined, args.app);
        await call(operation, { app: args.app });
        this.check(stamp, combined);
        return { launched: true, app: args.app, next: 'List windows before observing the target.' };
      }
      const entry = this.windows.get(args.windowId);
      if (!entry || entry.owner !== owner) throw new Error('Unknown or cross-session window; enumerate again');
      this.check(stamp, combined, entry.window.app, entry.window.title);
      const capture = async () => {
        this.observation = null;
        const live = (await call('list_windows', {})).find(window => window.id === entry.window.id && window.app === entry.window.app);
        if (!live) throw new Error('Window is no longer available; enumerate again');
        this.check(stamp, combined, live.app, live.title);
        entry.window = live;
        const state = await call('get_window_state', { window: live, include_text: true, include_screenshot: true });
        if (state.window.id !== live.id || state.window.app !== live.app) throw new Error('Capture returned a different window');
        this.check(stamp, combined, state.window.app, state.window.title);
        const id = randomUUID();
        const result = await prepare({ ...state, observationId: id, windowId: args.windowId });
        this.check(stamp, combined);
        this.observation = { id, owner, windowId: args.windowId, state, time: this.now(), stamp };
        return result;
      };
      if (operation === 'observe') return await capture();
      const action = validateAction(operation, args.input);
      const observation = this.observation;
      const assertObservation = () => {
        if (!observation || this.observation !== observation || observation.owner !== owner
          || observation.id !== args.observationId || observation.windowId !== args.windowId
          || observation.stamp !== stamp || this.now() - observation.time > config.observationTtlMs) {
          throw new Error('Observation is stale or belongs to another session/window; observe again');
        }
      };
      assertObservation();
      if (action.element_index !== undefined && !observation.state.accessibility?.tree) throw new Error('No accessibility tree; observe again');
      if (operation === 'type_text' && !observation.state.accessibility?.focused_element) throw new Error('No observed input focus; observe again');
      if (action.screenshotId !== undefined) {
        const shot = observation.state.screenshots.find(item => item.id === action.screenshotId);
        if (!shot) throw new Error('Unknown screenshot; observe again');
        for (const [x, y] of [[action.x, action.y], [action.from_x, action.from_y], [action.to_x, action.to_y]]) {
          if (x !== undefined && (!Number.isFinite(shot.width) || !Number.isFinite(shot.height) || x >= shot.width || y >= shot.height)) {
            throw new Error('Coordinates outside observed screenshot bounds');
          }
        }
      }
      await this.authorize(owner, operation, { ...args, app: entry.window.app }, config, combined);
      this.check(stamp, combined, entry.window.app, entry.window.title);
      assertObservation();
      this.observation = null;
      const current = (await call('list_windows', {})).find(window => window.id === entry.window.id && window.app === entry.window.app);
      if (!current) throw new Error('Window disappeared before input; enumerate again');
      this.check(stamp, combined, current.app, current.title);
      try {
        await call(operation, { ...action, window: current });
        return await capture();
      } catch (error) {
        throw new Error(`Action or refresh outcome is unknown; never automatically replay input. Observe again. ${error.message}`);
      }
    } catch (error) {
      this.observation = null;
      this.lastError = error.message;
      if (combined.aborted) {
        this.windows.clear();
        await this.runtime.stop();
      }
      throw error;
    } finally {
      this.active = null;
    }
  }

  async authorize(owner, operation, args, config, signal) {
    if (config.mode === 'read-only') throw new Error('Read-only mode does not permit launching, activation, or input');
    if (!['ordinary', 'sensitive'].includes(args.risk) || typeof args.purpose !== 'string' || !args.purpose.trim()) {
      throw new Error('Every state change requires purpose and risk classification');
    }
    const sensitive = args.risk === 'sensitive' || RISK_TEXT.test(JSON.stringify(args));
    if (config.mode === 'ask' || sensitive) {
      const outcome = await this.approve(owner, operation, args, signal);
      signal.throwIfAborted();
      if (outcome !== 'allowed-once') throw new Error(`DSH approval ${outcome}; no input performed`);
    }
  }
}
