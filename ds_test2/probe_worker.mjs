import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

if (isMainThread) {
  const N = 4;
  const sab = new SharedArrayBuffer(N * 8);
  const view = new Float64Array(sab);
  const jobs = Array.from({ length: N }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { i, sab } });
    w.on('message', res);
    w.on('error', rej);
  }));
  const msgs = await Promise.all(jobs);
  console.log('messages:', JSON.stringify(msgs));
  console.log('shared  :', JSON.stringify(Array.from(view)));
  console.log('OK: worker_threads + SharedArrayBuffer usable');
} else {
  const { i, sab } = workerData;
  const view = new Float64Array(sab);
  let acc = 0;
  for (let k = 0; k < 1e6; k++) acc += Math.sqrt(k * (i + 1));
  view[i] = acc;
  parentPort.postMessage(`worker${i} done`);
}
