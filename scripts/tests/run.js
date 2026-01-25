process.env.DISABLE_V8_COMPILE_CACHE = process.env.DISABLE_V8_COMPILE_CACHE || '1';

const path = require('path');
const { register } = require('ts-node');

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS'
  }
});

globalThis.__bbmcp_test_promises = [];

const tests = [
  'uvAtlas.test.ts',
  'uvPaintPixels.test.ts',
  'revisionGuard.test.ts',
  'toolSchemas.test.ts',
  'routerUtils.test.ts',
  'toolRegistry.test.ts',
  'toolResponse.test.ts',
  'session.test.ts',
  'proxyValidators.test.ts',
  'versionConsistency.test.ts',
  'domPort.test.ts',
  'proxyMetaPipeline.test.ts',
  'proxyTexture.test.ts',
  'sidecarCodec.test.ts'
];

(async () => {
  for (const test of tests) {
    require(path.join(__dirname, test));
  }
  const pending = Array.isArray(globalThis.__bbmcp_test_promises) ? globalThis.__bbmcp_test_promises : [];
  if (pending.length > 0) {
    await Promise.all(pending);
  }
  console.log('tests ok');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
