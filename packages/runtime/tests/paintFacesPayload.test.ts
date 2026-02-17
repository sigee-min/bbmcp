import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { Capabilities, PaintFacesPayload } from '../src/types';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { normalizePaintTarget, resolveTextureForPaintFaces } from '../src/usecases/textureTools/paintFacesPayload';
import { createEditorStub } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 256, maxTextureSize: 64, maxAnimationSeconds: 120 }
};

const basePayload: PaintFacesPayload = {
  textureName: 'atlas',
  target: { cubeName: 'cube', face: 'north' },
  op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
};

const createContext = (options?: {
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
  resolution?: { width: number; height: number } | null;
  createBlankTexture?: TextureToolContext['createBlankTexture'];
}) => {
  let textures =
    options?.textures ??
    [
      {
        id: 'tex1',
        name: 'atlas',
        width: 16,
        height: 16
      }
    ];
  const editor: EditorPort = {
    ...createEditorStub({ textureResolution: options?.resolution ?? { width: 16, height: 16 } }),
    getProjectTextureResolution: () => options?.resolution ?? { width: 16, height: 16 }
  };
  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => ({
      id: 'p1',
      format: 'entity_rig',
      formatId: 'geckolib_model',
      name: 'demo',
      dirty: false,
      uvPixelsPerBlock: undefined,
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [{ id: 'cube1', name: 'cube', bone: 'root', from: [0, 0, 0], to: [16, 16, 16] }],
      textures,
      animations: [],
      animationsStatus: 'available',
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    capabilities,
    getUvPolicyConfig: () => DEFAULT_UV_POLICY,
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    updateTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    createBlankTexture: options?.createBlankTexture
  };
  return {
    ctx,
    setTextures: (next: Array<{ id?: string; name: string; width?: number; height?: number }>) => {
      textures = next;
    }
  };
};

{
  const res = normalizePaintTarget(undefined);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const res = normalizePaintTarget({ face: 'north' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const res = normalizePaintTarget({ cubeName: 'cube', face: 'bad' as 'north' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const res = normalizePaintTarget({ cubeName: 'cube' });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.faces.length, 6);
}

{
  const { ctx } = createContext({
    textures: [
      { id: 'tex-id', name: 'atlas' },
      { id: 'another', name: 'other' }
    ]
  });
  const res = resolveTextureForPaintFaces(
    ctx,
    basePayload,
    ctx.getSnapshot(),
    'tex-id',
    'other'
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createContext({
    textures: [{ id: 'tex-id', name: 'atlas', width: 16, height: 16 }]
  });
  const res = resolveTextureForPaintFaces(
    ctx,
    basePayload,
    ctx.getSnapshot(),
    'tex-id',
    undefined
  );
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.id, 'tex-id');
}

{
  const { ctx } = createContext({ textures: [] });
  const res = resolveTextureForPaintFaces(
    { ...ctx, createBlankTexture: undefined },
    basePayload,
    ctx.getSnapshot(),
    undefined,
    'atlas'
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const { ctx } = createContext({
    textures: [],
    createBlankTexture: () => ({ ok: true, value: { id: 'tex-new', name: 'atlas', created: true } })
  });
  const res = resolveTextureForPaintFaces(
    ctx,
    { ...basePayload, width: 999, height: 999 },
    ctx.getSnapshot(),
    undefined,
    'atlas'
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const harness = createContext({
    textures: [],
    createBlankTexture: () => {
      harness.setTextures([{ id: 'tex-new', name: 'atlas', width: 16, height: 16 }]);
      return { ok: true, value: { id: 'tex-new', name: 'atlas', created: true } };
    }
  });
  const res = resolveTextureForPaintFaces(
    harness.ctx,
    basePayload,
    harness.ctx.getSnapshot(),
    undefined,
    'atlas'
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.id, 'tex-new');
    assert.equal(res.value.name, 'atlas');
  }
}

{
  const harness = createContext({
    textures: [],
    createBlankTexture: () => ({ ok: true, value: { id: 'tex-new', name: 'atlas', created: true } })
  });
  const res = resolveTextureForPaintFaces(
    harness.ctx,
    basePayload,
    harness.ctx.getSnapshot(),
    undefined,
    'atlas'
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}
