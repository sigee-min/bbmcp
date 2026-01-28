import assert from 'node:assert/strict';

import type { TextureUsageResult } from '../../src/ports/editor';
import type { ToolError } from '../../src/types';
import { computeTextureUsageId } from '../../src/domain/textureUsage';
import { DEFAULT_UV_POLICY } from '../../src/domain/uvPolicy';
import { toDomainTextureUsage } from '../../src/usecases/domainMappers';
import { tryRecoverUvForTextureSpec } from '../../src/proxy/texturePipeline/recovery';
import { DEFAULT_LIMITS, makeProxyDeps } from './helpers';

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

const uvUsageId = computeTextureUsageId(toDomainTextureUsage(usageResult));

const calls = { autoUvAtlas: 0, preflight: 0 };

const project = {
  id: 'p',
  active: true,
  name: null,
  format: null,
  revision: 'r1',
  counts: { bones: 0, cubes: 0, textures: 1, animations: 0 },
  cubes: [],
  textures: [],
  animations: []
};

const service = {
  autoUvAtlas: (_payload: unknown) => {
    calls.autoUvAtlas += 1;
    return {
      ok: true,
      value: { applied: true, steps: 1, resolution: { width: 16, height: 16 }, textures: [] }
    };
  },
  preflightTexture: (_payload: unknown) => {
    calls.preflight += 1;
    return {
      ok: true,
      value: {
        uvUsageId,
        usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 }
      }
    };
  },
  getTextureUsage: (_payload: unknown) => ({ ok: true, value: usageResult }),
  getProjectState: (_payload: unknown) => ({ ok: true, value: { project } }),
  getUvPolicy: () => DEFAULT_UV_POLICY
};

const deps = makeProxyDeps({
  service,
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  limits: DEFAULT_LIMITS
});

const meta = { includeState: false, includeDiff: false, diffDetail: 'summary' } as const;
const targets = { ids: new Set<string>(), names: new Set<string>() };
const error: ToolError = {
  code: 'invalid_state',
  message: 'UV overlap detected.',
  details: { overlaps: [{ textureName: 'tex', conflictCount: 1 }] }
};

const res = tryRecoverUvForTextureSpec(deps, { autoRecover: true }, meta, targets, error);
assert.ok(res);
assert.equal(res?.ok, true);
assert.equal(calls.autoUvAtlas, 1);
assert.equal(calls.preflight, 1);
if (res && res.ok) {
  assert.equal(res.data.uvUsageId, uvUsageId);
  assert.equal(res.data.recovery.reason, 'uv_overlap');
  assert.ok(res.data.recovery.autoUvAtlas);
}
