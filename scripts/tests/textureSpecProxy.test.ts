import assert from 'node:assert/strict';

import type { ApplyTextureSpecPayload } from '../../src/spec';
import type { TextureUsageResult } from '../../src/ports/editor';
import { applyTextureSpecProxy } from '../../src/proxy/texturePipeline/applyTextureSpecProxy';
import { computeTextureUsageId } from '../../src/domain/textureUsage';
import { DEFAULT_UV_POLICY } from '../../src/domain/uvPolicy';
import { toDomainTextureUsage } from '../../src/usecases/domainMappers';
import { createMockDom, DEFAULT_LIMITS, makeProxyDeps, ok, registerAsync } from './helpers';

const usageResult: TextureUsageResult = {
  textures: [
    {
      id: 'tex-1',
      name: 'tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [
        { id: 'cube-1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 16, 16] }] }
      ]
    }
  ]
};
const uvUsageId = computeTextureUsageId(toDomainTextureUsage(usageResult));

const project = {
  id: 'p',
  active: true,
  name: null,
  format: 'geckolib',
  revision: 'r1',
  counts: { bones: 0, cubes: 1, textures: 1, animations: 0 },
  cubes: [
    {
      id: 'cube-1',
      name: 'cube',
      from: [0, 0, 0],
      to: [1, 1, 1],
      bone: 'root'
    }
  ],
  textures: [],
  animations: []
};

let lastImport: { width: number; height: number } | null = null;

const deps = makeProxyDeps({
  service: {
    getTextureUsage: (_payload: unknown) => ok(usageResult),
    getProjectState: (_payload: unknown) => ok({ project }),
    getUvPolicy: () => DEFAULT_UV_POLICY,
    importTexture: (payload: { width?: number; height?: number; name?: string }) => {
      lastImport = {
        width: payload.width ?? 0,
        height: payload.height ?? 0
      };
      return ok({ id: 'tex-1', name: payload.name ?? 'tex' });
    },
    readTexture: (_payload: unknown) =>
      ok({
        name: 'tex',
        width: lastImport?.width ?? 16,
        height: lastImport?.height ?? 16
      }),
    getProjectTextureResolution: () => null
  },
  dom: createMockDom(),
  limits: DEFAULT_LIMITS
});

const payload: ApplyTextureSpecPayload = {
  uvUsageId,
  textures: [{ name: 'tex', width: 16, height: 16, ops: [] }]
};

registerAsync(
  (async () => {
    const res = await applyTextureSpecProxy(deps, payload);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.applied, true);
      assert.equal(res.data.report.applied.textures.length, 1);
      assert.ok(Array.isArray(res.nextActions));
    }
  })()
);
