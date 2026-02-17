import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { Capabilities } from '/contracts/types/internal';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { runPaintFaces } from '../src/usecases/textureTools/texturePaintFaces';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { createEditorStub, createMockImage } from './fakes';

const imageTagMap = new WeakMap<CanvasImageSource, string>();

const createTaggedImage = (tag: string): CanvasImageSource => {
  const image = createMockImage(`data:image/png;base64,${tag === 'after' ? 'BBBB' : 'AAAA'}`);
  imageTagMap.set(image, tag);
  return image;
};

const readTaggedImageTag = (image: CanvasImageSource): string | undefined => imageTagMap.get(image);

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

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true, flags: { singleTexture: true } },
  limits: { maxCubes: 128, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

// Recovery path should rollback when post-recovery texture opacity collapses.
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
  let preflightCalls = 0;
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
    })
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
    getUvPolicyConfig: () => ({ ...DEFAULT_UV_POLICY, autoMaxRetries: 1 }),
    importTexture: (_payload) => ({ ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } }),
    updateTexture: (payload) => {
      updateCalls += 1;
      currentImage = payload.image;
      if (readTaggedImageTag(currentImage) === 'before') rollbackCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'minecraft_dragon' } };
    },
    assignTexture: () => ({ ok: true, value: { textureName: 'minecraft_dragon', cubeCount: 1 } }),
    preflightTexture: () => {
      preflightCalls += 1;
      return {
        ok: true,
        value: {
          uvUsageId: '',
          usageSummary: { textureCount: 1, cubeCount: 1, faceCount: 1, unresolvedCount: 0 },
          warningCodes: preflightCalls === 1 ? ['uv_scale_mismatch'] : [],
          textureUsage: usage
        }
      };
    },
    autoUvAtlas: () =>
      ({
        ok: true,
        value: {
          applied: true,
          steps: 1,
          resolution: { width, height },
          textures: []
        }
      }) as const,
    runWithoutRevisionGuard: (fn) => fn()
  };

  const res = runPaintFaces(ctx, {
    ifRevision: 'r1',
    textureName: 'minecraft_dragon',
    target: { cubeName: 'body_main', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#3f6f3b' }
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.details?.reason, 'texture_recovery_guard');
  }
  assert.equal(updateCalls, 2);
  assert.equal(rollbackCalls, 1);
}
