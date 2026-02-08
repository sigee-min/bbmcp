const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const buildPlugin = () =>
  esbuild.build({
    entryPoints: [path.join(repoRoot, 'apps/plugin-desktop/src/index.ts')],
    outfile: path.join(repoRoot, 'dist/ashfox.js'),
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    logLevel: 'info'
  });

const buildSidecar = () =>
  esbuild.build({
    entryPoints: [path.join(repoRoot, 'apps/mcp-headless/src/index.ts')],
    outfile: path.join(repoRoot, 'dist/ashfox-sidecar.js'),
    bundle: true,
    sourcemap: true,
    platform: 'node',
    format: 'cjs',
    target: ['es2020'],
    logLevel: 'info'
  });

const VALID_TARGETS = new Set(['all', 'plugin-desktop', 'mcp-headless']);

const parseTargets = () => {
  const arg = process.argv[2] || 'all';
  if (!VALID_TARGETS.has(arg)) {
    throw new Error(`Unknown build target: ${arg}. Use one of ${Array.from(VALID_TARGETS).join(', ')}`);
  }
  if (arg === 'all') return ['plugin-desktop', 'mcp-headless'];
  return [arg];
};

(async () => {
  const targets = parseTargets();
  ensureDir(path.join(repoRoot, 'dist'));
  if (targets.includes('plugin-desktop')) {
    await buildPlugin();
  }
  if (targets.includes('mcp-headless')) {
    await buildSidecar();
  }
  console.log('build ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

