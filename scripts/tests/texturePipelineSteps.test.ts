import assert from 'node:assert/strict';

import { createTexturePipelineContext, runPreflightStep, runPresetStep, runUvStep } from '../../src/proxy/texturePipeline/steps';
import type { ProxyPipeline } from '../../src/proxy/pipeline';
import type { ProxyPipelineDeps } from '../../src/proxy/types';
import { DEFAULT_LIMITS, fail, makeProxyDeps, ok } from './helpers';

const createPipeline = (): ProxyPipeline => ({
  meta: { includeState: false, includeDiff: false, diffDetail: 'summary' },
  guardRevision: () => null,
  run: async (fn) => await fn(),
  ok: (data) => ({ ok: true, data }),
  wrap: (result) => (result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error }),
  error: (error) => ({ ok: false, error })
});

const createDeps = (overrides?: Partial<ProxyPipelineDeps>): ProxyPipelineDeps => {
  const baseService = {
    preflightTexture: () =>
      ok({
        uvUsageId: 'uv-1',
        usageSummary: { textureCount: 0, cubeCount: 0, faceCount: 0, unresolvedCount: 0 }
      }),
    generateTexturePreset: () => ok({ id: 't1', name: 'preset_tex', width: 16, height: 16 })
  };
  return makeProxyDeps({
    ...(overrides ?? {}),
    service: { ...baseService, ...(overrides?.service ?? {}) },
    limits: DEFAULT_LIMITS
  });
};

// runPreflightStep should record preflight snapshot + set uvUsageId.
{
  const deps = createDeps();
  const steps = {};
  const ctx = createTexturePipelineContext({
    deps,
    pipeline: createPipeline(),
    steps,
    includePreflight: true,
    includeUsage: false
  });
  const res = runPreflightStep(ctx, 'before');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(ctx.currentUvUsageId, 'uv-1');
    assert.ok((steps as { preflight?: unknown }).preflight);
  }
}

// runUvStep should error when uvUsageId is missing.
{
  const deps = createDeps();
  const steps = {};
  const ctx = createTexturePipelineContext({
    deps,
    pipeline: createPipeline(),
    steps,
    includePreflight: false,
    includeUsage: false
  });
  const res = runUvStep(ctx, [{ faces: { north: [0, 0, 1, 1] } }]);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
}

// runPresetStep should record preset results.
{
  const deps = createDeps();
  const steps = {};
  const ctx = createTexturePipelineContext({
    deps,
    pipeline: createPipeline(),
    steps,
    includePreflight: false,
    includeUsage: false
  });
  ctx.currentUvUsageId = 'uv-2';
  const res = runPresetStep(
    ctx,
    [{ preset: 'wood', width: 16, height: 16, uvUsageId: 'uv-2' }],
    undefined,
    undefined
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(ctx.steps.presets?.applied, 1);
  }
}

// runPresetStep should surface failures from the service.
{
  const deps = createDeps({
    service: {
      generateTexturePreset: () => fail({ code: 'invalid_payload', message: 'bad preset' })
    }
  });
  const steps = {};
  const ctx = createTexturePipelineContext({
    deps,
    pipeline: createPipeline(),
    steps,
    includePreflight: false,
    includeUsage: false
  });
  ctx.currentUvUsageId = 'uv-3';
  const res = runPresetStep(ctx, [{ preset: 'wood', width: 16, height: 16, uvUsageId: 'uv-3' }]);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}
