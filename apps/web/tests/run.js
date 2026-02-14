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

const discoverTests = () =>
  fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

(async () => {
  const testFiles = discoverTests();
  if (testFiles.length === 0) {
    throw new Error('No tests discovered in apps/web/tests');
  }
  for (const testFile of testFiles) {
    require(path.join(__dirname, testFile));
  }
  console.log('tests ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
