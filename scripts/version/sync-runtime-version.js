/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginPkgPath = path.join(repoRoot, 'apps', 'plugin-desktop', 'package.json');
const ashfoxPkgPath = path.join(repoRoot, 'apps', 'ashfox', 'package.json');
const runtimeConfigPath = path.join(repoRoot, 'packages', 'runtime', 'src', 'config.ts');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');
const readJson = (filePath) => JSON.parse(readText(filePath));

const ensureRuntimeConfigInjection = () => {
  const text = readText(runtimeConfigPath);
  if (!text.includes('__ASHFOX_PLUGIN_VERSION__')) {
    throw new Error(
      'version sync: runtime config is missing build-time version injection token (__ASHFOX_PLUGIN_VERSION__).'
    );
  }
};

const main = () => {
  const pluginPkg = readJson(pluginPkgPath);
  const ashfoxPkg = readJson(ashfoxPkgPath);
  const pluginVersion = typeof pluginPkg.version === 'string' ? pluginPkg.version : null;
  const ashfoxVersion = typeof ashfoxPkg.version === 'string' ? ashfoxPkg.version : null;

  if (!pluginVersion) throw new Error('version sync: apps/plugin-desktop/package.json is missing a string version');
  if (!ashfoxVersion) throw new Error('version sync: apps/ashfox/package.json is missing a string version');

  if (pluginVersion !== ashfoxVersion) {
    throw new Error(
      `version sync: app version drift detected: apps/plugin-desktop(${pluginVersion}) != apps/ashfox(${ashfoxVersion})`
    );
  }

  ensureRuntimeConfigInjection();

  if (checkOnly) {
    console.log(`runtime version check ok: ${pluginVersion}`);
    return;
  }

  console.log(`runtime version source: apps/plugin-desktop (${pluginVersion})`);
  console.log('runtime version delivery: build-time injection (__ASHFOX_PLUGIN_VERSION__) + env fallback for tests');
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
