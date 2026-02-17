import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { Capabilities, PaintFacesPayload, PaintFacesResult, TextureUsageResult } from '../src/types';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { runPaintFacesPass } from '../src/usecases/textureTools/paintFacesPass';
import { createEditorStub, createMockImage } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true, flags: { singleTexture: true } },
  limits: { maxCubes: 128, maxTextureSize: 32, maxAnimationSeconds: 30 }
};

const createUsage = (uv: [number, number, number, number] = [0, 0, 8, 8]): TextureUsageResult => ({
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'body', faces: [{ face: 'north', uv }] }]
    }
  ]
});

const createPixels = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 20;
    data[i + 1] = 40;
    data[i + 2] = 60;
    data[i + 3] = 255;
  }
  return data;
};

type PassSetup = {
  usageRaw?: TextureUsageResult;
  resolution?: { width: number; height: number } | null;
  textureRead?: ReturnType<EditorPort['readTexture']>;
  resolvedTexture?: { id?: string; name: string; width?: number; height?: number };
  payload?: Partial<PaintFacesPayload>;
  coordSpace?: 'face' | 'texture';
  renderer?: TextureRendererPort;
  updateTexture?: TextureToolContext['updateTexture'];
  recoveryAttempts?: NonNullable<PaintFacesResult['recovery']>['attempts'];
};

const createPassSetup = (options: PassSetup = {}) => {
  const usageRaw = options.usageRaw ?? createUsage();
  const resolution = options.resolution === undefined ? { width: 16, height: 16 } : options.resolution;
  const textureRead =
    options.textureRead ??
    ({
      result: {
        id: 'tex1',
        name: 'atlas',
        width: 16,
        height: 16,
        image: createMockImage('data:image/png;base64,ATLS')
      }
    } as ReturnType<EditorPort['readTexture']>);

  const editor: EditorPort = {
    ...createEditorStub({ textureResolution: resolution }),
    readTexture: () => textureRead,
    getProjectTextureResolution: () => resolution
  };

  const renderer =
    options.renderer ??
    ({
      readPixels: ({ width = 16, height = 16 }) => ({
        result: { width, height, data: createPixels(width, height) }
      }),
      renderPixels: ({ width, height, data }) => ({
        result: {
          image: createMockImage(`data:image/png;base64,${Math.max(1, Math.floor(data.length / 4)).toString(16)}`),
          width,
          height
        }
      })
    } as TextureRendererPort);

  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => ({
      id: 'p1',
      format: 'entity_rig',
      formatId: 'geckolib_model',
      name: 'atlas',
      bones: [{ name: 'root', pivot: [0, 0, 0] }],
      cubes: [{ id: 'cube1', name: 'body', bone: 'root', from: [0, 0, 0], to: [8, 8, 8] }],
      textures: [{ id: 'tex1', name: 'atlas', width: 16, height: 16 }],
      animations: [],
      animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
    }),
    editor,
    textureRenderer: renderer,
    capabilities,
    getUvPolicyConfig: () => DEFAULT_UV_POLICY,
    importTexture: () => ({ ok: true, value: { id: 'tex1', name: 'atlas' } }),
    updateTexture:
      options.updateTexture ??
      (() => ({
        ok: true,
        value: { id: 'tex1', name: 'atlas' }
      }))
  };

  const payload: PaintFacesPayload = {
    textureName: 'atlas',
    target: { cubeName: 'body', face: 'north' },
    op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#336699' },
    ...(options.payload ?? {})
  };

  return {
    run: () =>
      runPaintFacesPass({
        ctx,
        textureRenderer: renderer,
        payload,
        coordSpace: options.coordSpace ?? (payload.coordSpace ?? 'face'),
        normalizedTarget: { cubeName: 'body', faces: ['north'] },
        resolvedTexture: options.resolvedTexture ?? { id: 'tex1', name: 'atlas', width: 16, height: 16 },
        usageRaw,
        recoveryAttempts: options.recoveryAttempts ?? [],
        backup: null
      })
  };
};

// readTexture without image should fail before rendering.
{
  const setup = createPassSetup({
    textureRead: { result: { id: 'tex1', name: 'atlas', width: 16, height: 16 } }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

// missing texture dimensions should return invalid_payload.
{
  const setup = createPassSetup({
    resolution: null,
    textureRead: { result: { id: 'tex1', name: 'atlas', image: {} as CanvasImageSource } },
    resolvedTexture: { id: 'tex1', name: 'atlas' }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// source size that exceeds limits should include max size guidance.
{
  const setup = createPassSetup({
    payload: { width: 128, height: 128 }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.details?.maxSize, 32);
  }
}

// invalid UV bounds should fail with no_bounds.
{
  const setup = createPassSetup({
    usageRaw: createUsage([Number.NaN, 0, 8, 8])
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.details?.reason, 'no_bounds');
}

// texture-space operations must overlap target UV rects.
{
  const setup = createPassSetup({
    coordSpace: 'texture',
    payload: { coordSpace: 'texture', width: 16, height: 16, op: { op: 'fill_rect', x: 12, y: 12, width: 2, height: 2, color: '#336699' } }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.details?.coordSpace, 'texture');
}

// missing readPixels support should fail as invalid_state.
{
  const renderer: TextureRendererPort = {
    renderPixels: ({ width, height }) => ({
      result: { image: createMockImage('data:image/png;base64,EDGE'), width, height }
    })
  };
  const setup = createPassSetup({ renderer });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

// invalid color should be rejected by op application.
{
  const setup = createPassSetup({
    payload: { op: { op: 'fill_rect', x: 0, y: 0, width: 1, height: 1, color: '#zzzzzz' } }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.details?.opIndex, 0);
}

// NaN lineWidth should fail with invalid_line_width mapping.
{
  const setup = createPassSetup({
    payload: { op: { op: 'draw_rect', x: 0, y: 0, width: 4, height: 4, color: '#336699', lineWidth: Number.NaN } }
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// render errors should bubble up.
{
  const renderer: TextureRendererPort = {
    readPixels: () => ({ result: { width: 16, height: 16, data: createPixels(16, 16) } }),
    renderPixels: () => ({ error: { code: 'unknown', message: 'render failed' } })
  };
  const setup = createPassSetup({ renderer });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('render failed'), true);
}

// missing render result should return invalid_state.
{
  const renderer: TextureRendererPort = {
    readPixels: () => ({ result: { width: 16, height: 16, data: createPixels(16, 16) } }),
    renderPixels: () => ({})
  };
  const setup = createPassSetup({ renderer });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

// update no_change is accepted and still returns a success payload.
{
  const setup = createPassSetup({
    updateTexture: () => ({
      ok: false,
      error: { code: 'no_change', message: 'unchanged' }
    })
  });
  const res = setup.run();
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.targets, 1);
    assert.equal(res.value.opsApplied, 1);
  }
}

// update failures except no_change should fail.
{
  const setup = createPassSetup({
    updateTexture: () => ({
      ok: false,
      error: { code: 'invalid_state', message: 'update failed' }
    })
  });
  const res = setup.run();
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('update failed'), true);
}

// Face-space full fill should cover the entire mapped face area (regression: only 1-2 pixels updated).
{
  const setup = createPassSetup({
    usageRaw: createUsage([0, 0, 16, 16]),
    payload: {
      op: { op: 'fill_rect', x: 0, y: 0, width: 16, height: 16, color: '#2f4b38' }
    }
  });
  const res = setup.run();
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.facesApplied, 1);
    assert.equal(res.value.opsApplied, 1);
    assert.equal(res.value.changedPixels, 256);
    assert.equal(res.value.resolvedSource?.coordSpace, 'face');
  }
}
