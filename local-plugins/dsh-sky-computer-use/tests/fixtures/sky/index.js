const window = { id: 1, app: 'test.exe', title: 'Controlled fixture' };
let hungClose = false;
let cancel;

/** Fake public adapter, used only by subprocess tests; never touches the desktop. */
export const sky = {
  target: 'windows',
  async list_windows() { return [window]; },
  async list_apps() { return [{ id: window.app, windows: [window] }]; },
  async launch_app({ app }) {
    if (app === 'exit.exe') process.exit(3);
    if (app === 'hang.exe') await new Promise((_resolve, reject) => { cancel = reject; });
    if (app === 'hung-close.exe') {
      hungClose = true;
      await new Promise(() => {});
    }
    if (app === 'denied.exe') throw new Error('Computer Use requires app approval but elicitations are unavailable');
  },
  async get_window_state() {
    return { window, accessibility: { tree: 'Test' }, screenshots: [] };
  },
  async type_text() {},
  async close() {
    if (hungClose) await new Promise(() => {});
    cancel?.(new Error('Native call cancelled'));
  },
};
