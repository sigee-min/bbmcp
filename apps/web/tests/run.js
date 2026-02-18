process.env.DISABLE_V8_COMPILE_CACHE = process.env.DISABLE_V8_COMPILE_CACHE || '1';
process.env.VITE_ASHFOX_GATEWAY_API_BASE_URL = process.env.VITE_ASHFOX_GATEWAY_API_BASE_URL || '/api';

const fs = require('fs');
const path = require('path');
const { register } = require('ts-node');

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node',
    jsx: 'react-jsx'
  }
});

const createCssModuleExports = () => {
  let cssModule;
  cssModule = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === '__esModule') return true;
        if (property === 'default') return cssModule;
        return String(property);
      }
    }
  );
  return cssModule;
};

require.extensions['.css'] = (module) => {
  module.exports = createCssModuleExports();
};

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
for (const extension of imageExtensions) {
  require.extensions[extension] = (module, filename) => {
    module.exports = filename;
  };
}

const discoverTests = () =>
  fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.js'))
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

(async () => {
  const testFiles = discoverTests();
  if (testFiles.length === 0) {
    throw new Error('No tests discovered in apps/web/tests');
  }
  for (const testFile of testFiles) {
    const loaded = require(path.join(__dirname, testFile));
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
  console.log('tests ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
