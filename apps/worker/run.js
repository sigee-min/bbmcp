process.env.DISABLE_V8_COMPILE_CACHE = process.env.DISABLE_V8_COMPILE_CACHE || '1';

const fs = require('fs');
const path = require('path');
const { register } = require('ts-node');

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node'
  }
});

const testsDir = path.join(__dirname, 'tests');

const discoverTests = () =>
  fs
    .readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

(async () => {
  const tests = discoverTests();
  if (tests.length === 0) {
    throw new Error('No tests discovered in apps/worker/tests');
  }
  for (const test of tests) {
    const loaded = require(path.join(testsDir, test));
    if (typeof loaded === 'function') {
      await loaded();
      continue;
    }
    if (loaded && typeof loaded.then === 'function') {
      await loaded;
      continue;
    }
    if (loaded && typeof loaded.run === 'function') {
      await loaded.run();
    }
  }
  console.log('worker tests ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
