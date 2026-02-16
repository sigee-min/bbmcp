import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY, type UvPolicyConfig } from '../src/domain/uv/policy';
import type { Capabilities } from '../src/types';
import { runAutoUvAtlas } from '../src/usecases/textureTools/autoUvAtlas';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { createMockImage } from './fakes';

type UsageTexture = {
  id?: string;
  name: string;
  cubeCount: number;
  faceCount: number;
  cubes: Array<{
    id?: string;
    name: string;
    faces: Array<{ face: 'north' | 'south' | 'east' | 'west' | 'up' | 'down'; uv?: [number, number, number, number] }>;
  }>;
};

const baseCapabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true, flags: { singleTexture: true } },
  limits: { maxCubes: 512, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 80;
    data[i + 1] = 100;
    data[i + 2] = 120;
    data[i + 3] = 255;
  }
  return data;
};

const baseUsage = (): { textures: UsageTexture[]; unresolved?: Array<{ textureRef: string; cubeName: string; face: 'north' }> } => ({
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
});

const baseSnapshot = (cubeSize: [number, number, number] = [8, 8, 1]) => ({
  id: 'p1',
  format: 'entity_rig',
  formatId: 'geckolib_model',
  name: 'atlas',
  bones: [{ name: 'root', pivot: [0, 0, 0] as [number, number, number] }],
  cubes: [
    {
      id: 'cube1',
      name: 'cube',
      from: [0, 0, 0] as [number, number, number],
      to: [cubeSize[0], cubeSize[1], cubeSize[2]] as [number, number, number],
      bone: 'root'
    }
  ],
  textures: [{ id: 'tex1', name: 'atlas', width: 16, height: 16 }],
  animations: [],
  animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
});

type ContextOptions = {
  ensureRevisionMatch?: TextureToolContext['ensureRevisionMatch'];
  usageResult?: ReturnType<EditorPort['getTextureUsage']>;
  resolution?: ReturnType<EditorPort['getProjectTextureResolution']>;
  resizeErr?: ReturnType<EditorPort['setProjectTextureResolution']>;
  setProjectUvPixelsPerBlock?: TextureToolContext['setProjectUvPixelsPerBlock'];
  policy?: UvPolicyConfig;
  capabilities?: Capabilities;
  cubeSize?: [number, number, number];
  snapshot?: ReturnType<TextureToolContext['getSnapshot']>;
  includeRenderer?: boolean;
};

const createContext = (options: ContextOptions = {}): TextureToolContext => {
  const usageResult = options.usageResult ?? { result: baseUsage() };
  const resolution = options.resolution === undefined ? { width: 16, height: 16 } : options.resolution;
  const resizeErr = options.resizeErr ?? null;
  const cubeSize = options.cubeSize ?? [8, 8, 1];
  const snapshot = options.snapshot ?? baseSnapshot(cubeSize);

  const editor = {
    getTextureUsage: () => usageResult,
    getProjectTextureResolution: () => resolution,
    setProjectTextureResolution: () => resizeErr,
    readTexture: () => ({
      result: {
        id: 'tex1',
        name: 'atlas',
        width: 16,
        height: 16,
        image: createMockImage('data:image/png;base64,BEFR')
      }
    }),
    setFaceUv: () => null
  } as never;

  const textureRenderer: TextureRendererPort = {
    readPixels: () => ({ result: { width: 16, height: 16, data: createOpaque(16, 16) } }),
    renderPixels: () => ({
      result: {
        image: createMockImage('data:image/png;base64,AFTR'),
        width: 16,
        height: 16
      }
    })
  };

  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch:
      options.ensureRevisionMatch ??
      (() => null),
    getSnapshot: () => snapshot,
    editor,
    capabilities: options.capabilities ?? baseCapabilities,
    getUvPolicyConfig: () => options.policy ?? DEFAULT_UV_POLICY,
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    updateTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    setProjectUvPixelsPerBlock: options.setProjectUvPixelsPerBlock
  };
  if (options.includeRenderer !== false) {
    ctx.textureRenderer = textureRenderer;
  }
  return ctx;
};

{
  const ctx = createContext({
    ensureRevisionMatch: () => ({ code: 'invalid_payload', message: 'revision mismatch' })
  });
  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'old-revision' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const ctx = createContext({
    usageResult: { error: { code: 'unknown', message: 'usage failed' } }
  });
  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'r1' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'unknown');
}

{
  const ctx = createContext({
    usageResult: { result: undefined }
  });
  const res = runAutoUvAtlas(ctx, { apply: false });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const usage = baseUsage();
  usage.unresolved = [{ textureRef: '#missing', cubeName: 'cube', face: 'north' }];
  const ctx = createContext({
    usageResult: { result: usage }
  });
  const res = runAutoUvAtlas(ctx, { apply: false });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const ctx = createContext({
    resolution: null
  });
  const res = runAutoUvAtlas(ctx, { apply: false });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const ctx = createContext({
    policy: { ...DEFAULT_UV_POLICY, autoMaxResolution: 64 }
  });
  const res = runAutoUvAtlas(ctx, { apply: false, padding: 1.9 });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.applied, false);
    assert.equal(res.value.steps >= 0, true);
  }
}

{
  const ctx = createContext({
    capabilities: {
      ...baseCapabilities,
      limits: { ...baseCapabilities.limits, maxTextureSize: 16 }
    },
    policy: { ...DEFAULT_UV_POLICY, autoMaxResolution: 16 },
    cubeSize: [640, 640, 16]
  });
  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'r1', padding: -3.5 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const multiUsage = {
    textures: [
      {
        id: 'tex1',
        name: 'atlas',
        cubeCount: 5,
        faceCount: 5,
        cubes: [
          { id: 'cube1', name: 'cube1', faces: [{ face: 'north' as const }] },
          { id: 'cube2', name: 'cube2', faces: [{ face: 'north' as const }] },
          { id: 'cube3', name: 'cube3', faces: [{ face: 'north' as const }] },
          { id: 'cube4', name: 'cube4', faces: [{ face: 'north' as const }] },
          { id: 'cube5', name: 'cube5', faces: [{ face: 'north' as const }] }
        ]
      }
    ]
  };
  const multiSnapshot = {
    ...baseSnapshot([128, 128, 1]),
    cubes: [
      { id: 'cube1', name: 'cube1', from: [0, 0, 0] as [number, number, number], to: [128, 128, 1] as [number, number, number], bone: 'root' },
      { id: 'cube2', name: 'cube2', from: [0, 0, 0] as [number, number, number], to: [128, 128, 1] as [number, number, number], bone: 'root' },
      { id: 'cube3', name: 'cube3', from: [0, 0, 0] as [number, number, number], to: [128, 128, 1] as [number, number, number], bone: 'root' },
      { id: 'cube4', name: 'cube4', from: [0, 0, 0] as [number, number, number], to: [128, 128, 1] as [number, number, number], bone: 'root' },
      { id: 'cube5', name: 'cube5', from: [0, 0, 0] as [number, number, number], to: [128, 128, 1] as [number, number, number], bone: 'root' }
    ]
  };
  const ctx = createContext({
    usageResult: { result: multiUsage },
    snapshot: multiSnapshot,
    policy: { ...DEFAULT_UV_POLICY, pixelsPerBlock: 1, autoMaxResolution: 64 },
    setProjectUvPixelsPerBlock: () => null,
    resizeErr: { code: 'invalid_state', message: 'resize blocked' }
  });
  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'r1' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('resize blocked'), true);
}

{
  const ctx = createContext({
    includeRenderer: false
  });
  const res = runAutoUvAtlas(ctx, { apply: true, ifRevision: 'r1' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'not_implemented');
}
