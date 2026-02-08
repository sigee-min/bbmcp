const esbuild = require('esbuild');
const fs = require('fs');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const buildPlugin = () =>
  esbuild.build({
    entryPoints: ['src/plugin.ts'],
    outfile: 'dist/ashfox.js',
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    logLevel: 'info'
  });

const buildSidecar = () =>
  esbuild.build({
    entryPoints: ['src/sidecar/index.ts'],
    outfile: 'dist/ashfox-sidecar.js',
    bundle: true,
    sourcemap: true,
    platform: 'node',
    format: 'cjs',
    target: ['es2020'],
    logLevel: 'info'
  });

(async () => {
  ensureDir('dist');
  await buildPlugin();
  await buildSidecar();
  console.log('build ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

