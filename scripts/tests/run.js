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
  'uvScale.test.ts',
  'uvRectIssues.test.ts',
  'uvPaintPixels.test.ts',
  'targetFilters.test.ts',
  'revisionGuard.test.ts',
  'toolSchemas.test.ts',
  'routerUtils.test.ts',
  'revisionNextActions.test.ts',
  'routerSchemaError.test.ts',
  'toolRegistry.test.ts',
  'toolResponse.test.ts',
  'toolResponseGuard.test.ts',
  'dispatcherHandler.test.ts',
  'projectDialogDefaults.test.ts',
  'session.test.ts',
  'versionConsistency.test.ts',
  'texturePresetAutoRecover.test.ts',
  'textureUsageIdSize.test.ts',
  'blockbenchSpecSnapshot.test.ts',
  'blockbenchSimSpec.test.ts',
  'blockbenchSimAutoUv.test.ts',
  'blockbenchSimReplay.test.ts',
  'traceLogReplay.test.ts',
  'traceLogAdvanced.test.ts',
  'sidecarCodec.test.ts',
  'animationTimePolicy.test.ts',
  'usecaseCoverage.test.ts',
  'validationSnapshot.test.ts',
  'stateServices.test.ts'
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

