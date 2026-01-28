import assert from 'node:assert/strict';

import type { TextureUsageResult } from '../../src/ports/editor';
import { computeTextureUsageId } from '../../src/domain/textureUsage';
import { DEFAULT_UV_POLICY } from '../../src/domain/uvPolicy';
import { toDomainTextureUsage } from '../../src/usecases/domainMappers';
import { resolveTextureUsageForTargets } from '../../src/proxy/texturePipeline/usageResolver';
import { DEFAULT_LIMITS, makeProxyDeps, ok } from './helpers';

const usageResult: TextureUsageResult = {
  textures: [
    {
      id: 'tex-1',
      name: 'tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [
        {
          id: 'cube-1',
          name: 'cube',
          faces: [{ face: 'north', uv: [0, 0, 16, 16] }]
        }
      ]
    }
  ]
};

const currentUsageId = computeTextureUsageId(toDomainTextureUsage(usageResult));
const calls = { preflight: 0, autoUvAtlas: 0 };

const project = {
  id: 'p',
  active: true,
  name: null,
  format: 'geckolib',
  revision: 'r1',
  counts: { bones: 0, cubes: 1, textures: 1, animations: 0 },
  cubes: [],
  textures: [],
  animations: []
};

const service = {
  getTextureUsage: (_payload: unknown) => ok(usageResult),
  getProjectState: (_payload: unknown) => ok({ project }),
  getUvPolicy: () => DEFAULT_UV_POLICY,
  preflightTexture: (_payload: unknown) => {
    calls.preflight += 1;
    return ok({
      uvUsageId: currentUsageId,
      usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 }
    });
  },
  autoUvAtlas: (_payload: unknown) => {
    calls.autoUvAtlas += 1;
    return ok({ applied: true, steps: 1, resolution: { width: 16, height: 16 }, textures: [] });
  }
};

const deps = makeProxyDeps({
  service,
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  limits: DEFAULT_LIMITS
});

const meta = { includeState: false, includeDiff: false, diffDetail: 'summary' } as const;
const targets = { ids: new Set<string>(), names: new Set<string>() };

// Auto-recover path: uvUsageId mismatch triggers preflight recovery.
{
  const res = resolveTextureUsageForTargets({
    deps,
    payload: { autoRecover: true },
    meta,
    targets,
    uvUsageId: 'stale'
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.uvUsageId, currentUsageId);
    assert.equal(res.data.recovery?.reason, 'uv_usage_mismatch');
  }
  assert.equal(calls.preflight, 1);
  assert.equal(calls.autoUvAtlas, 0);
}
