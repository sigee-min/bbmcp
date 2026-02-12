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

globalThis.__ashfox_test_promises = [];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const setRuntimeVersionEnv = () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const pluginPkg = readJson(path.join(repoRoot, 'apps', 'plugin-desktop', 'package.json'));
  const ashfoxPkg = readJson(path.join(repoRoot, 'apps', 'ashfox', 'package.json'));
  const pluginVersion = typeof pluginPkg.version === 'string' ? pluginPkg.version.trim() : '';
  const ashfoxVersion = typeof ashfoxPkg.version === 'string' ? ashfoxPkg.version.trim() : '';

  if (!pluginVersion || !ashfoxVersion) {
    throw new Error('runtime tests: missing app version in package.json');
  }
  if (pluginVersion !== ashfoxVersion) {
    throw new Error(
      `runtime tests: app version drift detected: apps/plugin-desktop(${pluginVersion}) != apps/ashfox(${ashfoxVersion})`
    );
  }
  process.env.ASHFOX_PLUGIN_VERSION = pluginVersion;
};

setRuntimeVersionEnv();

const discoverTests = () =>
  fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

const tests = discoverTests();
const testFilter = process.env.ASHFOX_TEST_FILTER;
const selectedTests = testFilter ? tests.filter((test) => test.includes(testFilter)) : tests;

(async () => {
  if (selectedTests.length === 0) {
    throw new Error(testFilter ? `No tests matched filter: ${testFilter}` : 'No test files discovered.');
  }
  for (const test of selectedTests) {
    require(path.join(__dirname, test));
  }
  const pending = Array.isArray(globalThis.__ashfox_test_promises) ? globalThis.__ashfox_test_promises : [];
  if (pending.length > 0) {
    await Promise.all(pending);
  }
  console.log('tests ok');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

