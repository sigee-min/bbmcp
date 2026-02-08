/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const readText = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(readText(relPath));

const failures = [];
const assertRule = (condition, message) => {
  if (!condition) failures.push(message);
};

const parsePluginVersion = (sourceText) => {
  const match = sourceText.match(/export const PLUGIN_VERSION = '([^']+)'/);
  return match ? match[1] : null;
};

const pkg = readJson('package.json');
const packageVersion = typeof pkg.version === 'string' ? pkg.version : '';
const packageName = typeof pkg.name === 'string' ? pkg.name : '';

assertRule(Boolean(packageVersion), 'package.json version is missing or invalid.');
assertRule(Boolean(packageName), 'package.json name is missing or invalid.');

const configText = readText('packages/runtime/src/config.ts');
const pluginVersion = parsePluginVersion(configText);
assertRule(Boolean(pluginVersion), 'packages/runtime/src/config.ts does not expose PLUGIN_VERSION.');
if (pluginVersion) {
  assertRule(
    pluginVersion === packageVersion,
    `Version mismatch: package.json(${packageVersion}) != packages/runtime/src/config.ts(${pluginVersion}).`
  );
}

const manifest = readJson('.github/release-please/manifest.json');
const manifestVersion = typeof manifest['.'] === 'string' ? manifest['.'] : '';
assertRule(Boolean(manifestVersion), '.github/release-please/manifest.json must define "." version.');
if (manifestVersion) {
  assertRule(
    manifestVersion === packageVersion,
    `Version mismatch: package.json(${packageVersion}) != release manifest(${manifestVersion}).`
  );
}

const releaseConfig = readJson('.github/release-please/config.json');
const rootPackageConfig = releaseConfig?.packages?.['.'];
assertRule(Boolean(rootPackageConfig), 'release-please config must define packages["."].');

if (rootPackageConfig) {
  const releaseType = rootPackageConfig['release-type'];
  const configuredPackageName = rootPackageConfig['package-name'];
  const component = rootPackageConfig.component;
  const preMajorPatchMode = rootPackageConfig['bump-patch-for-minor-pre-major'];
  const extraFiles = Array.isArray(rootPackageConfig['extra-files']) ? rootPackageConfig['extra-files'] : [];

  assertRule(releaseType === 'node', `release-type must be "node" (actual: ${String(releaseType)}).`);
  assertRule(
    configuredPackageName === packageName,
    `release-please package-name(${String(configuredPackageName)}) must match package.json name(${packageName}).`
  );
  assertRule(
    typeof component === 'string' && component.trim().length > 0,
    'release-please component must be a non-empty string.'
  );
  assertRule(
    preMajorPatchMode === true,
    'release-please bump-patch-for-minor-pre-major must be true for pre-1.0 patch-first releases.'
  );
  assertRule(
    extraFiles.includes('packages/runtime/src/config.ts'),
    'release-please extra-files must include packages/runtime/src/config.ts to keep PLUGIN_VERSION synced.'
  );
}

const releaseWorkflow = readText('.github/workflows/release-please.yml');
const expectedAssets = [
  `dist/${packageName}.js`,
  `dist/${packageName}.js.map`,
  `dist/${packageName}-sidecar.js`,
  `dist/${packageName}-sidecar.js.map`
];
for (const assetPath of expectedAssets) {
  assertRule(
    releaseWorkflow.includes(assetPath),
    `.github/workflows/release-please.yml must upload asset: ${assetPath}.`
  );
}

if (failures.length > 0) {
  console.error('ashfox release validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`ashfox release validation ok (name=${packageName}, version=${packageVersion})`);
}
