import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { Capabilities, PreflightTextureResult, TextureUsageResult } from '../src/types';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { runPaintFaces } from '../src/usecases/textureTools/texturePaintFaces';
import {
  TEXTURE_FACES_COORD_SPACE_INVALID,
  TEXTURE_FACES_OP_REQUIRED,
  TEXTURE_FACES_TEXTURE_REQUIRED,
} from '../src/shared/messages';
import { createEditorStub, createMockImage } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true, flags: { singleTexture: true } },
  limits: { maxCubes: 256, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 40;
    data[i + 1] = 60;
    data[i + 2] = 80;
    data[i + 3] = 255;
  }
  return data;
};

const createUsage = (): TextureUsageResult => ({
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'body', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
});

const createContext = (options?: {
  projectName?: string | null;
  preflight?: PreflightTextureResult;
  usage?: TextureUsageResult;
  autoUvAtlas?: TextureToolContext['autoUvAtlas'];
}) => {
  const width = 16;
  const height = 16;
  const usage = options?.usage ?? createUsage();
  const image = createMockImage('data:image/png;base64,ATLAS');
  let updateCalls = 0;

  const editor: EditorPort = {
    ...createEditorStub({ textureUsage: usage, textureResolution: { width, height } }),
    readTexture: () => ({ result: { id: 'tex1', name: 'atlas', width, height, image } }),
  };

  const textureRenderer: TextureRendererPort = {
    readPixels: () => ({ result: { width, height, data: createOpaque(width, height) } }),
    renderPixels: ({ width: renderWidth, height: renderHeight }) => ({
      result: { image, width: renderWidth, height: renderHeight }
    })
  };

  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => ({
      id: 'p1',
      format: 'entity_rig',
      formatId: 'geckolib_model',
      name: options?.projectName === undefined ? 'atlas' : options.projectName,
      dirty: false,
      uvPixelsPerBlock: undefined,
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [{ id: 'cube1', name: 'body', bone: 'root', from: [0, 0, 0], to: [8, 8, 8] }],
      textures: [{ id: 'tex1', name: 'atlas', width, height }],
      animations: [],
      animationsStatus: 'available',
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    textureRenderer,
    capabilities,
    getUvPolicyConfig: () => ({ ...DEFAULT_UV_POLICY, autoMaxRetries: 1 }),
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    updateTexture: () => {
      updateCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'atlas' } };
    },
    assignTexture: () => ({ ok: true, value: { textureName: 'atlas', cubeCount: 1 } }),
    preflightTexture: () => ({
      ok: true,
      value:
        options?.preflight ?? {
          uvUsageId: '',
          usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 },
          warningCodes: [],
          textureUsage: usage
        }
    }),
    autoUvAtlas: options?.autoUvAtlas,
    runWithoutRevisionGuard: (fn) => fn()
  };

  return { ctx, getUpdateCalls: () => updateCalls };
};

{
  const { ctx, getUpdateCalls } = createContext({ projectName: null });
  const res = runPaintFaces(ctx, {
    target: { cubeName: 'body', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_FACES_TEXTURE_REQUIRED);
  }
  assert.equal(getUpdateCalls(), 0);
}

{
  const { ctx } = createContext();
  const res = runPaintFaces(
    { ...ctx, textureRenderer: undefined },
    {
      textureName: 'atlas',
      target: { cubeName: 'body', face: 'north' },
      op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'not_implemented');
    assert.ok(res.error.message.startsWith('texture renderer unavailable'));
  }
}

{
  const { ctx } = createContext();
  const res = runPaintFaces(ctx, {
    textureName: 'atlas',
    target: { cubeName: 'body', face: 'north' },
    op: undefined as never
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_FACES_OP_REQUIRED);
  }
}

{
  const { ctx } = createContext();
  const res = runPaintFaces(ctx, {
    textureName: 'atlas',
    target: { cubeName: 'body', face: 'north' },
    coordSpace: 'invalid' as 'face',
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_FACES_COORD_SPACE_INVALID);
  }
}

{
  const { ctx, getUpdateCalls } = createContext({
    preflight: {
      uvUsageId: '',
      usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 },
      warningCodes: []
    }
  });
  const res = runPaintFaces(ctx, {
    textureName: 'atlas',
    target: { cubeName: 'body', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
  });
  assert.equal(res.ok, true);
  assert.equal(getUpdateCalls(), 1);
}

{
  const { ctx, getUpdateCalls } = createContext({
    preflight: {
      uvUsageId: 'wrong-usage-id',
      usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 },
      warningCodes: [],
      textureUsage: createUsage()
    }
  });
  const res = runPaintFaces(ctx, {
    textureName: 'atlas',
    target: { cubeName: 'body', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.details?.reason, 'uv_usage_mismatch');
  }
  assert.equal(getUpdateCalls(), 0);
}
