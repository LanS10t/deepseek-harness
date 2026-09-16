await new Promise(resolve => setTimeout(resolve, 150));
let closed = false;

/** Delayed initialization fixture; a live resource keeps the process owned until close. */
const resource = setInterval(() => {}, 1000);
export const sky = {
  get target() { return 'windows'; },
  async list_windows() { if (closed) throw new Error('Already closed'); return []; },
  async close() { closed = true; clearInterval(resource); },
};
