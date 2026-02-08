process.env.DISABLE_V8_COMPILE_CACHE = process.env.DISABLE_V8_COMPILE_CACHE || '1';

const fs = require('fs');
const path = require('path');
const { register } = require('ts-node');

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS'
  }
});

const testsDir = path.join(__dirname, 'tests');

const discoverTests = () =>
  fs
    .readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

const tests = discoverTests();
const testFilter = process.env.ASHFOX_TEST_FILTER;
const selectedTests = testFilter ? tests.filter((test) => test.includes(testFilter)) : tests;

(async () => {
  if (selectedTests.length === 0) {
    throw new Error(testFilter ? `No conformance tests matched filter: ${testFilter}` : 'No conformance tests discovered.');
  }
  for (const test of selectedTests) {
    require(path.join(testsDir, test));
  }
  console.log('conformance tests ok');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
