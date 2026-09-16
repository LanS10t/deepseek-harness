import { SkyRuntime } from '../runtime.js';

const [packagePath, expectedVersion, application] = process.argv.slice(2);
if (!packagePath || !expectedVersion) {
  throw new Error('Usage: node scripts/native-probe.mjs <absolute-package-directory> <version> [test-app-id]');
}
const runtime = new SkyRuntime();
const config = { packagePath, expectedVersion, callTimeoutMs: 30000 };
let passed = true;
try {
  const windows = await runtime.call(config, 'list_windows', {}, new AbortController().signal);
  console.log(JSON.stringify({ stage: 'enumeration', status: 'PASS', count: windows.length }));
  if (application) {
    await runtime.call(config, 'launch_app', { app: application }, new AbortController().signal);
    console.log(JSON.stringify({ stage: 'launch', status: 'PASS', app: application }));
  }
} catch (error) {
  passed = false;
  console.log(JSON.stringify({ stage: 'native-probe', status: 'FAIL', error: error.message }));
} finally {
  await runtime.stop();
  console.log(JSON.stringify({ stage: 'shutdown', status: runtime.status() }));
  if (!passed || runtime.status() !== 'stopped') process.exitCode = 1;
}
