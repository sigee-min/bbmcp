import assert from 'node:assert/strict';

import type { EditorPort } from '../../src/ports/editor';
import type { TextureRendererPort } from '../../src/ports/textureRenderer';
import type { Capabilities, PaintMeshFacePayload } from '../../src/types';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../../src/domain/uv/policy';
import {
  TEXTURE_MESH_FACE_SCOPE_ALL_FORBIDS_FACE_ID,
  TEXTURE_MESH_FACE_SCOPE_SINGLE_REQUIRES_FACE_ID,
  TEXTURE_MESH_FACE_TARGET_REQUIRED,
  TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_REQUIRED
} from '../../src/shared/messages';
import type { TextureToolContext } from '../../src/usecases/textureTools/context';
import { runPaintMeshFace } from '../../src/usecases/textureTools/texturePaintMeshFace';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [{ format: 'generic_model', animations: true, enabled: true }],
  limits: { maxCubes: 256, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const basePayload: PaintMeshFacePayload = {
  textureName: 'atlas',
  target: { meshName: 'wing', faceId: 'f0' },
  op: { op: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: '#336699' }
};

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 30;
    data[i + 1] = 40;
    data[i + 2] = 50;
    data[i + 3] = 255;
  }
  return data;
};

const makeFace = (id: string, uv: Array<[number, number]>) => ({
  id,
  vertices: ['a', 'b', 'c', 'd'],
  uv: [
    { vertexId: 'a', uv: uv[0] },
    { vertexId: 'b', uv: uv[1] },
    { vertexId: 'c', uv: uv[2] },
    { vertexId: 'd', uv: uv[3] }
  ]
});

const createContext = (options?: {
  projectName?: string | null;
  faces?: Array<ReturnType<typeof makeFace> | { id: string; vertices: string[] }>;
}) => {
  const width = 32;
  const height = 32;
  const image = { tag: 'atlas' } as unknown as CanvasImageSource;
  let updateCalls = 0;

  const faces = options?.faces ?? [
    makeFace('f0', [
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 8]
    ]),
    makeFace('f1', [
      [8, 0],
      [16, 0],
      [16, 8],
      [8, 8]
    ])
  ];

  const editor = {
    readTexture: () => ({ result: { id: 'tex1', name: 'atlas', width, height, image } }),
    getProjectTextureResolution: () => ({ width, height })
  } as unknown as EditorPort;

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
      format: 'generic_model',
      formatId: 'free',
      name: options?.projectName === undefined ? 'atlas' : options.projectName,
      dirty: false,
      uvPixelsPerBlock: undefined,
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [],
      meshes: [
        {
          id: 'mesh1',
          name: 'wing',
          vertices: [
            { id: 'a', pos: [0, 0, 0] },
            { id: 'b', pos: [1, 0, 0] },
            { id: 'c', pos: [1, 1, 0] },
            { id: 'd', pos: [0, 1, 0] }
          ],
          faces
        }
      ],
      textures: [{ id: 'tex1', name: 'atlas', width, height }],
      animations: [],
      animationsStatus: 'available',
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    textureRenderer,
    capabilities,
    getUvPolicyConfig: () => DEFAULT_UV_POLICY,
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    updateTexture: () => {
      updateCalls += 1;
      return { ok: true, value: { id: 'tex1', name: 'atlas' } };
    }
  };

  return { ctx, getUpdateCalls: () => updateCalls };
};

{
  const { ctx } = createContext();
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    target: undefined as unknown as PaintMeshFacePayload['target']
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_MESH_FACE_TARGET_REQUIRED);
  }
}

{
  const { ctx } = createContext();
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    target: { meshName: 'wing' },
    scope: 'single_face'
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_MESH_FACE_SCOPE_SINGLE_REQUIRES_FACE_ID);
  }
}

{
  const { ctx } = createContext();
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    target: { meshName: 'wing', faceId: 'f0' },
    scope: 'all_faces'
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_MESH_FACE_SCOPE_ALL_FORBIDS_FACE_ID);
  }
}

{
  const { ctx } = createContext();
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    coordSpace: 'texture'
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_REQUIRED);
  }
}

{
  const { ctx, getUpdateCalls } = createContext();
  const res = runPaintMeshFace(ctx, basePayload);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.meshName, 'wing');
    assert.equal(res.value.scope, 'single_face');
    assert.equal(res.value.facesApplied, 1);
    assert.equal(res.value.opsApplied, 1);
    assert.equal(typeof res.value.changedPixels, 'number');
  }
  assert.equal(getUpdateCalls(), 1);
}

{
  const { ctx, getUpdateCalls } = createContext();
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    target: { meshName: 'wing' }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.scope, 'all_faces');
    assert.equal(res.value.facesApplied, 2);
  }
  assert.equal(getUpdateCalls(), 1);
}

{
  const { ctx } = createContext({
    faces: [
      makeFace('f0', [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8]
      ]),
      { id: 'broken', vertices: ['a', 'b', 'c'] }
    ]
  });
  const res = runPaintMeshFace(ctx, {
    ...basePayload,
    target: { meshName: 'wing' }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.facesApplied, 1);
    assert.equal(res.value.skippedFaces?.length, 1);
    assert.equal(res.value.skippedFaces?.[0]?.faceId, 'broken');
  }
}

