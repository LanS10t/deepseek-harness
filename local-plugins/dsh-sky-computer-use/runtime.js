import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Persistent public-Sky worker. A forced or unacknowledged shutdown permanently fails closed. */
export class SkyRuntime {
  constructor({ worker = new URL('./worker.js', import.meta.url), shutdownTimeoutMs = 5000 } = {}) {
    this.worker = worker;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.child = null;
    this.pending = new Map();
    this.poisoned = false;
    this.closing = null;
    this.identity = null;
    this.initialized = false;
    this.closedAck = false;
  }

  status() {
    return this.poisoned ? 'unavailable-restart-required' : this.closing ? 'stopping' : this.initialized ? 'ready' : 'stopped';
  }

  async start(config, signal) {
    signal.throwIfAborted();
    if (this.poisoned) throw new Error('Previous worker did not confirm shutdown; restart the DSH process');
    if (this.closing) throw new Error('Worker is stopping');
    const identity = JSON.stringify([config.packagePath, config.expectedVersion]);
    if (this.child && this.identity !== identity) await this.stop();
    if (this.poisoned) throw new Error('Worker shutdown could not be confirmed');
    if (this.initialized) return;
    if (this.child) throw new Error('Worker initialization is already in progress');
    const env = {};
    for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'HOME', 'PATH']) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const child = fork(this.worker, [], {
      env, execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    this.child = child;
    this.identity = identity;
    this.closedAck = false;
    this.exited = new Promise(resolve => {
      child.once('exit', () => {
        if (!this.closedAck) this.poisoned = true;
        for (const pending of this.pending.values()) pending.reject(new Error('Sky worker exited; operation outcome may be unknown'));
        this.pending.clear();
        this.child = null;
        this.initialized = false;
        resolve();
      });
    });
    child.on('error', error => {
      this.poisoned = true;
      for (const pending of this.pending.values()) pending.reject(error);
    });
    child.on('message', message => {
      if (message?.type === 'closed') this.closedAck = true;
      else if (message?.type === 'close-error') this.poisoned = true;
      else if (typeof message?.id === 'string') {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.ok === true) pending.resolve(message.value);
        else pending.reject(new Error(message.error || 'Sky worker request failed'));
      }
    });
    try {
      await this.request({ type: 'initialize', config: { packagePath: config.packagePath, expectedVersion: config.expectedVersion } }, config.callTimeoutMs, signal);
      this.initialized = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async call(config, operation, args, signal) {
    await this.start(config, signal);
    return await this.request({ type: 'call', operation, args }, config.callTimeoutMs, signal);
  }

  async request(message, timeoutMs, signal) {
    signal.throwIfAborted();
    if (!this.child?.connected || this.closing) throw new Error('Sky worker is unavailable');
    const id = randomUUID();
    let timer;
    let abort;
    let cancelReason;
    try {
      return await new Promise((resolve, reject) => {
        this.pending.set(id, {
          resolve: value => {
            if (cancelReason) reject(new Error(cancelReason));
            else resolve(value);
          },
          reject,
        });
        const cancel = reason => {
          if (cancelReason) return;
          cancelReason = reason;
          void this.stop().then(() => reject(new Error(reason)), reject);
        };
        abort = () => cancel('Desktop operation cancelled; observe again before any input');
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => cancel('Desktop operation timed out; outcome may be unknown'), timeoutMs);
        this.child.send({ ...message, id }, error => {
          if (error) cancel(`Worker transport failed: ${error.message}`);
        });
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      this.pending.delete(id);
      if (this.closing) await this.closing;
    }
  }

  async stop() {
    if (this.closing) return await this.closing;
    if (!this.child) return;
    const child = this.child;
    this.closing = (async () => {
      let timer;
      try {
        child.send({ type: 'close' }, error => { if (error) this.poisoned = true; });
        const finished = await Promise.race([
          this.exited.then(() => true),
          new Promise(resolve => { timer = setTimeout(() => resolve(false), this.shutdownTimeoutMs); }),
        ]);
        if (!finished) {
          this.poisoned = true;
          child.kill();
          const exited = await Promise.race([
            this.exited.then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), this.shutdownTimeoutMs).unref()),
          ]);
          if (!exited) throw new Error('Could not stop owned Sky worker; Computer Use remains unavailable');
        }
      } finally {
        clearTimeout(timer);
        this.initialized = false;
      }
    })();
    try { await this.closing; } finally { this.closing = null; }
  }
}
