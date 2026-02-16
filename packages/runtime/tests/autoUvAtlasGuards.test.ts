import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { Capabilities } from '../src/types';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { runAutoUvAtlas } from '../src/usecases/textureTools/autoUvAtlas';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { createEditorStub, createMockImage } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true, flags: { singleTexture: true } },
  limits: { maxCubes: 128, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 120;
    data[i + 1] = 140;
    data[i + 2] = 160;
    data[i + 3] = 255;
  }
  return data;
};

const createTransparent = (width: number, height: number): Uint8ClampedArray =>
  new Uint8ClampedArray(width * height * 4);

const imageTagMap = new WeakMap<CanvasImageSource, string>();

const createTaggedImage = (tag: string): CanvasImageSource => {
  const image = createMockImage(`data:image/png;base64,${tag === 'after' ? 'BBBB' : 'AAAA'}`);
  imageTagMap.set(image, tag);
  return image;
};

const readTaggedImageTag = (image: CanvasImageSource): string | undefined => imageTagMap.get(image);

// Duplicate cube names should still be mapped and applied by cubeId.
{
  const width = 16;
  const height = 16;
  const usage = {
    textures: [
      {
        id: 'tex1',
        name: 'tex',
        cubeCount: 2,
        faceCount: 2,
        cubes: [
          { id: 'cube-1', name: 'body', faces: [{ face: 'north' as const, uv: [0, 0, 8, 8] as [number, number, number, number] }] },
          { id: 'cube-2', name: 'body', faces: [{ face: 'north' as const, uv: [8, 0, 12, 4] as [number, number, number, number] }] }
        ]
      }
    ]
  };

  let currentImage = createTaggedImage('before');
  const faceUvCalls: Array<{ cubeId?: string; cubeName?: string; faces: Record<string, [number, number, number, number]> }> = [];

  const editor: EditorPort = {
    ...createEditorStub({ textureUsage: usage, textureResolution: { width, height } }),
    readTexture: () => ({
      result: {
        id: 'tex1',
        name: 'tex',
        width,
        height,
        image: currentImage
      }
    }),
    setFaceUv: (params: { cubeId?: string; cubeName?: string; faces: Record<string, [number, number, number, number]> }) => {
      faceUvCalls.push(params);
      return null;
    }
  };

  const textureRenderer: TextureRendererPort = {
    readPixels: () => ({ result: { width, height, data: createOpaque(width, height) } }),
    renderPixels: () => ({
      result: {
        image: createTaggedImage('after'),
        width,
        height
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
      name: 'dup-cube-names',
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [
        { id: 'cube-1', name: 'body', from: [0, 0, 0], to: [8, 8, 1], bone: 'root' },
        { id: 'cube-2', name: 'body', from: [0, 0, 0], to: [4, 4, 1], bone: 'root' }
      ],
      textures: [{ id: 'tex1', name: 'tex', width, height }],
      animations: [],
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    textureRenderer,
    capabilities,
    getUvPolicyConfig: () => DEFAULT_UV_POLICY,
    importTexture: (_payload) => ({ ok: true, value: { id: 'tex1', name: 'tex' } }),
    updateTexture: (payload) => {
      currentImage = payload.image;
      return { ok: true, value: { id: 'tex1', name: 'tex' } };
    }
  };

  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'r1' });
  assert.equal(res.ok, true);
  assert.equal(faceUvCalls.length, 2);
  assert.deepEqual(faceUvCalls.map((call) => call.cubeId).sort(), ['cube-1', 'cube-2']);
  const uvById = new Map(faceUvCalls.map((call) => [call.cubeId, call.faces.north]));
  assert.ok(uvById.get('cube-1'));
  assert.ok(uvById.get('cube-2'));
  assert.notDeepEqual(uvById.get('cube-1'), uvById.get('cube-2'));
}

// Auto UV reproject should rollback when post-write opacity collapses.
{
  const width = 16;
  const height = 16;
  const usage = {
    textures: [
      {
        id: 'tex1',
        name: 'minecraft_dragon',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'cube1', name: 'body_main', faces: [{ face: 'north' as const, uv: [0, 0, 8, 8] as [number, number, number, number] }] }]
      }
    ]
  };
  let currentImage = createTaggedImage('before');
  let updateCalls = 0;
  let rollbackCalls = 0;

  const editor: EditorPort = {
    ...createEditorStub({ textureUsage: usage, textureResolution: { width, height } }),
    readTexture: () => ({
      result: {
        id: 'tex1',
        name: 'minecraft_dragon',
        width,
        height,
        image: currentImage
      }
    }),
    setFaceUv: () => null
  };

  const textureRenderer: TextureRendererPort = {
    readPixels: ({ image }) => {
      if (readTaggedImageTag(image) === 'after') {
        return { result: { width, height, data: createTransparent(width, height) } };
      }
      return { result: { width, height, data: createOpaque(width, height) } };
    },
    renderPixels: () => ({
      result: {
        image: createTaggedImage('after'),
        width,
        height
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
    getUvPolicyConfig: () => DEFAULT_UV_POLICY,
    importTexture: (_payload) => ({ ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } }),
    updateTexture: (payload) => {
      updateCalls += 1;
      currentImage = payload.image;
      if (updateCalls > 1) rollbackCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } };
    }
  };

  const res = runAutoUvAtlas(ctx, {
    apply: true,
    ifRevision: 'r1'
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.details?.reason, 'texture_recovery_guard');
    assert.equal(res.error.details?.context, 'auto_uv_atlas');
  }
  assert.equal(updateCalls, 2);
  assert.equal(rollbackCalls, 1);
}
