import assert from 'node:assert/strict';

import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { Capabilities, PaintFacesPayload } from '../src/types';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { runPaintFaces } from '../src/usecases/textureTools/texturePaintFaces';
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
    data[i] = 60;
    data[i + 1] = 90;
    data[i + 2] = 120;
    data[i + 3] = 255;
  }
  return data;
};

const createContext = () => {
  const width = 16;
  const height = 16;
  let updateCalls = 0;
  const image = createMockImage('data:image/png;base64,TEX0');
  const usage = {
    textures: [
      {
        id: 'tex1',
        name: 'minecraft_dragon',
        cubeCount: 1,
        faceCount: 2,
        cubes: [
          {
            id: 'cube1',
            name: 'body_main',
            faces: [
              { face: 'north' as const, uv: [0, 0, 8, 8] as [number, number, number, number] },
              { face: 'south' as const, uv: [8, 0, 16, 8] as [number, number, number, number] }
            ]
          }
        ]
      }
    ]
  };

  const editor: EditorPort = {
    ...createEditorStub({ textureUsage: usage, textureResolution: { width, height } }),
    readTexture: () => ({
      result: {
        id: 'tex1',
        name: 'minecraft_dragon',
        width,
        height,
        image
      }
    })
  };

  const textureRenderer: TextureRendererPort = {
    readPixels: () => ({ result: { width, height, data: createOpaque(width, height) } }),
    renderPixels: ({ width: renderWidth, height: renderHeight }) => ({
      result: {
        image,
        width: renderWidth,
        height: renderHeight
      }
    })
  };

  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => ({
      id: 'p1',
      format: 'entity_rig',
      formatId: 'geckolib_model',
      name: 'minecraft_dragon',
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [{ id: 'cube1', name: 'body_main', from: [-4, 6, -7], to: [4, 14, 7], bone: 'root' }],
      textures: [{ id: 'tex1', name: 'minecraft_dragon', width, height }],
      animations: [],
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    textureRenderer,
    capabilities,
    getUvPolicyConfig: () => ({ ...DEFAULT_UV_POLICY, autoMaxRetries: 1 }),
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } }),
    updateTexture: () => {
      updateCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } };
    },
    assignTexture: () => ({ ok: true, value: { textureName: 'minecraft_dragon', cubeCount: 1 } }),
    preflightTexture: () => ({
      ok: true,
      value: {
        uvUsageId: '',
        usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 2, unresolvedCount: 0 },
        warningCodes: [],
        textureUsage: usage
      }
    }),
    runWithoutRevisionGuard: (fn) => fn()
  };

  return { ctx, getUpdateCalls: () => updateCalls };
};

const run = (ctx: TextureToolContext, payload: PaintFacesPayload) => runPaintFaces(ctx, payload);

{
  const { ctx, getUpdateCalls } = createContext();
  const res = run(ctx, {
    textureName: 'minecraft_dragon',
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 8, height: 8, color: '#3f6f3b' }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.targets, 1);
    assert.equal(res.value.facesApplied, 1);
    assert.equal(res.value.opsApplied, 1);
    assert.equal(res.value.resolvedSource?.coordSpace, 'face');
    assert.equal(res.value.resolvedSource?.width, 8);
    assert.equal(res.value.resolvedSource?.height, 8);
    assert.ok((res.value.changedPixels ?? 0) > 0);
  }
  assert.equal(getUpdateCalls(), 1);
}

{
  const { ctx, getUpdateCalls } = createContext();
  const res = run(ctx, {
    textureName: 'minecraft_dragon',
    target: { cubeName: 'body_main' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 16, height: 8, color: '#3f6f3b' }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.targets, 1);
    assert.equal(res.value.facesApplied, 2);
    assert.equal(res.value.opsApplied, 1);
    assert.equal(res.value.resolvedSource?.coordSpace, 'face');
    assert.equal(res.value.resolvedSource?.width, 16);
    assert.equal(res.value.resolvedSource?.height, 8);
    assert.ok((res.value.changedPixels ?? 0) > 0);
  }
  assert.equal(getUpdateCalls(), 1);
}

{
  const { ctx, getUpdateCalls } = createContext();
  const res = run(ctx, {
    textureName: 'minecraft_dragon',
    coordSpace: 'texture',
    width: 16,
    height: 16,
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 4, height: 4, color: '#3f6f3b' }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.resolvedSource?.coordSpace, 'texture');
    assert.equal(res.value.resolvedSource?.width, 16);
    assert.equal(res.value.resolvedSource?.height, 16);
    assert.ok((res.value.changedPixels ?? 0) > 0);
  }
  assert.equal(getUpdateCalls(), 1);
}

const assertBlocked = (payload: PaintFacesPayload, expectedText: string) => {
  const { ctx, getUpdateCalls } = createContext();
  const res = run(ctx, payload);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(res.error.message.includes(expectedText));
  }
  assert.equal(getUpdateCalls(), 0);
};

assertBlocked(
  JSON.parse(
    '{"textureName":"minecraft_dragon","op":{"op":"fill_rect","x":0,"y":0,"width":1,"height":1,"color":"#3f6f3b"}}'
  ) as PaintFacesPayload,
  'target object'
);

assertBlocked(
  {
    textureName: 'minecraft_dragon',
    target: { face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#3f6f3b' }
  },
  'cubeId or cubeName'
);

assertBlocked(
  {
    textureName: 'minecraft_dragon',
    target: { cubeName: 'body_main', face: 'north' },
    op: JSON.parse('{"op":"fill_rect","x":0,"y":0,"width":1,"height":1}') as PaintFacesPayload['op']
  },
  'invalid texture op'
);

assertBlocked(
  {
    textureName: 'minecraft_dragon',
    coordSpace: 'texture',
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#3f6f3b' }
  },
  'requires width and height'
);

assertBlocked(
  {
    textureName: 'minecraft_dragon',
    coordSpace: 'texture',
    width: 8,
    height: 8,
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#3f6f3b' }
  },
  'match texture size'
);

assertBlocked(
  {
    textureName: 'minecraft_dragon',
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 100, y: 100, width: 2, height: 2, color: '#3f6f3b' }
  },
  'outside the face source bounds'
);
