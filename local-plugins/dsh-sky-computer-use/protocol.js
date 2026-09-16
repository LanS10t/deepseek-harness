/** Fixed JSON request vocabulary shared by the host and its private worker. */
export const ACTIONS = Object.freeze({
  activate_window: {},
  click: { element_index: 'index?', x: 'coordinate?', y: 'coordinate?', screenshotId: 'string?', mouse_button: 'button?', click_count: 'count?' },
  press_key: { key: 'string' },
  type_text: { text: 'text' },
  set_value: { element_index: 'index', value: 'text' },
  scroll: { x: 'coordinate', y: 'coordinate', scrollX: 'delta', scrollY: 'delta', screenshotId: 'string' },
  drag: { from_x: 'coordinate', from_y: 'coordinate', to_x: 'coordinate', to_y: 'coordinate', screenshotId: 'string' },
  perform_secondary_action: { element_index: 'index', action: 'string' },
});

/** Reject unknown properties and malformed fixed action arguments at JSON boundaries. */
export function validateAction(operation, args) {
  if (!Object.hasOwn(ACTIONS, operation)) throw new Error('Unsupported desktop operation');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Action arguments must be an object');
  const fields = ACTIONS[operation];
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown action argument: ${key}`);
  }
  for (const [key, rule] of Object.entries(fields)) {
    const value = args[key];
    if (value === undefined && rule.endsWith('?')) continue;
    const type = rule.replace('?', '');
    const valid = type === 'text' ? typeof value === 'string' && value.length <= 20000 && !/[\u0000-\u0008\u000b-\u001f]/u.test(value)
      : type === 'string' ? typeof value === 'string' && value.length > 0 && value.length <= 1000
      : type === 'button' ? ['left', 'right', 'middle'].includes(value)
      : type === 'count' ? Number.isInteger(value) && value >= 1 && value <= 3
      : type === 'index' ? Number.isSafeInteger(value) && value >= 0
      : type === 'coordinate' ? Number.isFinite(value) && value >= 0 && value <= 100000
      : type === 'delta' && Number.isFinite(value) && Math.abs(value) <= 100000;
    if (!valid) throw new Error(`Invalid action argument: ${key}`);
  }
  if (operation === 'click') {
    const element = args.element_index !== undefined;
    const point = args.x !== undefined && args.y !== undefined && typeof args.screenshotId === 'string';
    if (element === point || (element && ['x', 'y', 'screenshotId'].some(key => args[key] !== undefined))) {
      throw new Error('Click requires either one element index or coordinates with screenshotId');
    }
  }
  if (operation === 'press_key' && /(^|\+)\s*(meta|windows|win|cmd|command|super|os)\s*(\+|$)/i.test(args.key)) {
    throw new Error('System launcher shortcuts are not permitted');
  }
  return args;
}

/** Validate a window supplied over the private process protocol. */
export function validateWindow(window) {
  if (!window || !Number.isSafeInteger(window.id) || typeof window.app !== 'string' || !window.app) {
    throw new Error('Invalid native window');
  }
  return window;
}
