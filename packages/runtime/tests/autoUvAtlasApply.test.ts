import assert from 'node:assert/strict';

import type { TextureUsage } from '../src/domain/model';
import type { AtlasPlan } from '../src/domain/uv/atlas';
import { applyAutoUvAtlasPlan, toReprojectTextureRenderer } from '../src/usecases/textureTools/autoUvAtlasApply';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { createMockImage } from './fakes';

const imageTagMap = new WeakMap<CanvasImageSource, string>();

const createTaggedImage = (tag: string): CanvasImageSource => {
  const image = createMockImage(`data:image/png;base64,${tag === 'after' ? 'BBBB' : 'AAAA'}`);
  imageTagMap.set(image, tag);
  return image;
};

const readTaggedImageTag = (image: CanvasImageSource): string | undefined => imageTagMap.get(image);

const baseUsage: TextureUsage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
};

const basePlan: AtlasPlan = {
  resolution: { width: 16, height: 16 },
  steps: 0,
  textures: [],
  assignments: [{ cubeId: 'cube1', cubeName: 'cube', face: 'north', uv: [0, 0, 8, 8] }]
};

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 100;
    data[i + 1] = 120;
    data[i + 2] = 140;
    data[i + 3] = 255;
  }
  return data;
};

const createTransparent = (width: number, height: number): Uint8ClampedArray =>
  new Uint8ClampedArray(width * height * 4);

const createHarness = (options?: {
  usage?: TextureUsage;
  plan?: AtlasPlan;
  readTextureImage?: CanvasImageSource | null;
  readTextureSize?: { width?: number; height?: number };
  readPixelsError?: boolean;
  renderError?: boolean;
  setFaceUvError?: boolean;
  updateNoChange?: boolean;
  updateFail?: boolean;
  rollbackDrop?: boolean;
}) => {
  const usage = options?.usage ?? baseUsage;
  const plan = options?.plan ?? basePlan;
  const width = 16;
  const height = 16;
  let currentImage = createTaggedImage('before');
  let updateCalls = 0;
  let rollbackCalls = 0;
  let setFaceUvCalls = 0;

  const ctx: TextureToolContext = {
    editor: {
      readTexture: () => ({
        result: {
          id: 'tex1',
          name: 'atlas',
          image:
            options?.readTextureImage === undefined
              ? currentImage
              : options.readTextureImage ?? undefined,
          width: options?.readTextureSize?.width ?? width,
          height: options?.readTextureSize?.height ?? height
        }
      }),
      setFaceUv: () => {
        setFaceUvCalls += 1;
        if (options?.setFaceUvError) return { code: 'invalid_state', message: 'setFaceUv failed' };
        return null;
      }
    } as never,
    updateTexture: (payload: Parameters<NonNullable<TextureToolContext['updateTexture']>>[0]) => {
      updateCalls += 1;
      currentImage = payload.image;
      if (options?.updateFail) return { ok: false, error: { code: 'invalid_state', message: 'update failed' } };
      if (options?.updateNoChange) return { ok: false, error: { code: 'no_change', message: 'same' } };
      if (updateCalls > 1) rollbackCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'atlas' } };
    },
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => ({ id: 'p', format: 'entity_rig', formatId: 'g', name: 'demo', bones: [], cubes: [], textures: [], animations: [], animationTimePolicy: { fpsDefault: 20, minKeyframeStep: 0.05, maxAnimationSeconds: 600, trimDecimals: 4 } } as never),
    capabilities: {
      pluginVersion: 'test',
      blockbenchVersion: 'test',
      authoring: { animations: true, enabled: true },
      limits: { maxCubes: 64, maxTextureSize: 64, maxAnimationSeconds: 120 }
    },
    getUvPolicyConfig: () => ({ pixelsPerBlock: 16 }),
    importTexture: () => ({ ok: true, value: { id: 'x', name: 'x' } })
  } as never;

  const renderer = toReprojectTextureRenderer({
    readPixels: ({ image }) => {
      if (options?.readPixelsError) return { error: { code: 'invalid_state', message: 'read failed' } };
      if (options?.rollbackDrop && readTaggedImageTag(image) === 'after') {
        return { result: { width, height, data: createTransparent(width, height) } };
      }
      return { result: { width, height, data: createOpaque(width, height) } };
    },
    renderPixels: () => {
      if (options?.renderError) return { error: { code: 'invalid_state', message: 'render failed' } };
      return { result: { image: createTaggedImage('after'), width, height } };
    }
  });
  assert.ok(renderer);

  return {
    ctx,
    usage,
    plan,
    renderer: renderer!,
    getCalls: () => ({ updateCalls, rollbackCalls, setFaceUvCalls })
  };
};

{
  assert.equal(toReprojectTextureRenderer(undefined), null);
  assert.equal(toReprojectTextureRenderer({ renderPixels: () => ({}) } as never), null);
}

{
  const harness = createHarness();
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, true);
  assert.equal(harness.getCalls().setFaceUvCalls, 1);
}

{
  const harness = createHarness({ readTextureImage: null });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const usageWithoutSize: TextureUsage = {
    textures: [
      {
        id: 'tex1',
        name: 'atlas',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
      }
    ]
  };
  const harness = createHarness({
    usage: usageWithoutSize,
    readTextureSize: { width: 0, height: 0 }
  });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const harness = createHarness({ readPixelsError: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('read failed'));
}

{
  const harness = createHarness({ renderError: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('render failed'));
}

{
  const harness = createHarness({ updateFail: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('update failed'));
}

{
  const harness = createHarness({ updateNoChange: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, true);
  assert.equal(harness.getCalls().updateCalls, 1);
  assert.equal(harness.getCalls().setFaceUvCalls, 1);
}

{
  const usageWithoutFaceUv: TextureUsage = {
    textures: [
      {
        id: 'tex1',
        name: 'atlas',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north' }] }]
      }
    ]
  };
  const harness = createHarness({ usage: usageWithoutFaceUv });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, true);
}

{
  const harness = createHarness({ setFaceUvError: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('setFaceUv failed'));
}

{
  const harness = createHarness({ rollbackDrop: true });
  const res = applyAutoUvAtlasPlan({
    ctx: harness.ctx,
    payload: {},
    usage: harness.usage,
    plan: harness.plan,
    textureRenderer: harness.renderer
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.details?.reason, 'texture_recovery_guard');
  assert.equal(harness.getCalls().rollbackCalls, 1);
}
