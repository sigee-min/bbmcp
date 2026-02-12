const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const resolveRuntimeVersion = () => {
  const pluginPkg = readJson(path.join(repoRoot, 'apps/plugin-desktop/package.json'));
  const ashfoxPkg = readJson(path.join(repoRoot, 'apps/ashfox/package.json'));
  const pluginVersion = typeof pluginPkg.version === 'string' ? pluginPkg.version.trim() : '';
  const ashfoxVersion = typeof ashfoxPkg.version === 'string' ? ashfoxPkg.version.trim() : '';

  if (!pluginVersion) throw new Error('build: apps/plugin-desktop/package.json version is missing.');
  if (!ashfoxVersion) throw new Error('build: apps/ashfox/package.json version is missing.');
  if (pluginVersion !== ashfoxVersion) {
    throw new Error(
      `build: app version drift detected: apps/plugin-desktop(${pluginVersion}) != apps/ashfox(${ashfoxVersion})`
    );
  }
  return pluginVersion;
};

const buildPlugin = (runtimeVersion) =>
  esbuild.build({
    entryPoints: [path.join(repoRoot, 'apps/plugin-desktop/src/index.ts')],
    outfile: path.join(repoRoot, 'dist/ashfox-bbplugin.js'),
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    define: {
      __ASHFOX_PLUGIN_VERSION__: JSON.stringify(runtimeVersion)
    },
    logLevel: 'info'
  });

const buildSidecar = (runtimeVersion) =>
  esbuild.build({
    entryPoints: [path.join(repoRoot, 'apps/ashfox/src/index.ts')],
    outfile: path.join(repoRoot, 'dist/ashfox.js'),
    bundle: true,
    sourcemap: true,
    platform: 'node',
    format: 'cjs',
    target: ['es2020'],
    define: {
      __ASHFOX_PLUGIN_VERSION__: JSON.stringify(runtimeVersion)
    },
    logLevel: 'info'
  });

const VALID_TARGETS = new Set(['all', 'plugin-desktop', 'ashfox']);

const parseTargets = () => {
  const arg = process.argv[2] || 'all';
  if (!VALID_TARGETS.has(arg)) {
    throw new Error(`Unknown build target: ${arg}. Use one of ${Array.from(VALID_TARGETS).join(', ')}`);
  }
  if (arg === 'all') return ['plugin-desktop', 'ashfox'];
  return [arg];
};

(async () => {
  const targets = parseTargets();
  const runtimeVersion = resolveRuntimeVersion();
  ensureDir(path.join(repoRoot, 'dist'));
  if (targets.includes('plugin-desktop')) {
    await buildPlugin(runtimeVersion);
  }
  if (targets.includes('ashfox')) {
    await buildSidecar(runtimeVersion);
  }
  console.log('build ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

