import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { ToolError, PaintTexturePayload, TextureUsageResult } from '../src/types';
import { MAX_TEXTURE_OPS } from '../src/domain/textureOps';
import { computeTextureUsageId } from '../src/domain/textureUsage';
import { DEFAULT_ANIMATION_TIME_POLICY } from '../src/domain/animation/timePolicy';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { toDomainTextureUsage } from '../src/usecases/domainMappers';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { runPaintTexture } from '../src/usecases/textureTools/texturePaint';
import { createEditorStub, createMockImage } from './fakes';

const capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 256, maxTextureSize: 64, maxAnimationSeconds: 120 }
} as const;

type HarnessOptions = {
  usage?: TextureUsageResult;
  usageError?: ToolError;
  projectResolution?: { width: number; height: number } | null;
  noRenderer?: boolean;
  renderError?: ToolError;
  renderWithoutResult?: boolean;
  importError?: ToolError;
  updateError?: ToolError;
  snapshotTextures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
  snapshotCubes?: Array<{
    id?: string;
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone?: string;
  }>;
  policy?: Partial<typeof DEFAULT_UV_POLICY>;
};

const createUsage = (
  textureName = 'atlas',
  uv: [number, number, number, number] = [0, 0, 16, 16]
): TextureUsageResult => ({
  textures: [
    {
      id: 'tex1',
      name: textureName,
      width: 16,
      height: 16,
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north', uv }] }]
    }
  ]
});

const usageIdFor = (usage: TextureUsageResult, resolution = { width: 16, height: 16 }) =>
  computeTextureUsageId(toDomainTextureUsage(usage), resolution);

const createHarness = (options: HarnessOptions = {}) => {
  const image = createMockImage('data:image/png;base64,IMG0');
  const usage = options.usage ?? createUsage();
  const projectResolution = options.projectResolution ?? { width: 16, height: 16 };
  const calls = {
    importCount: 0,
    updateCount: 0,
    renderCount: 0
  };

  const editor: EditorPort = {
    ...createEditorStub({ textureUsage: usage, textureResolution: projectResolution }),
    getTextureUsage: () => {
      if (options.usageError) return { error: options.usageError };
      return { result: usage };
    }
  };

  const snapshotCubes =
    options.snapshotCubes?.map((cube) => ({ ...cube, bone: cube.bone ?? 'root' })) ??
    [
      {
        id: 'cube1',
        name: 'cube',
        bone: 'root',
        from: [0, 0, 0] as [number, number, number],
        to: [16, 16, 16] as [number, number, number]
      }
    ];

  const snapshot = {
    id: 'p1',
    format: 'entity_rig',
    formatId: 'geckolib_model',
    name: 'demo',
    dirty: false,
    uvPixelsPerBlock: undefined,
    bones: [{ name: 'root', pivot: [0, 0, 0] as [number, number, number] }],
    cubes: snapshotCubes,
    textures:
      options.snapshotTextures ??
      [
        {
          id: 'tex1',
          name: 'atlas',
          width: 16,
          height: 16
        }
      ],
    animations: [],
    animationsStatus: 'available' as const,
    animationTimePolicy: DEFAULT_ANIMATION_TIME_POLICY
  };

  const ctx: TextureToolContext = {
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getSnapshot: () => snapshot as ReturnType<TextureToolContext['getSnapshot']>,
    editor,
    textureRenderer: options.noRenderer
      ? undefined
      : {
          renderPixels: () => {
            calls.renderCount += 1;
            if (options.renderError) return { error: options.renderError };
            if (options.renderWithoutResult) return {};
            return { result: { image, width: 16, height: 16 } };
          }
        },
    capabilities,
    getUvPolicyConfig: () => ({ ...DEFAULT_UV_POLICY, scaleTolerance: 2, ...(options.policy ?? {}) }),
    importTexture: () => {
      calls.importCount += 1;
      if (options.importError) return { ok: false, error: options.importError };
      return { ok: true, value: { id: 'tex_new', name: 'atlas_new' } };
    },
    updateTexture: () => {
      calls.updateCount += 1;
      if (options.updateError) return { ok: false, error: options.updateError };
      return { ok: true, value: { id: 'tex1', name: 'atlas' } };
    }
  };

  return { ctx, usage, calls };
};

const fillOp = { op: 'fill_rect', x: 0, y: 0, width: 4, height: 4, color: '#228833' } as const;

const createPayload = (override: Partial<PaintTexturePayload> = {}): PaintTexturePayload => ({
  mode: 'create',
  name: 'atlas_new',
  width: 16,
  height: 16,
  ops: [fillOp],
  ...override
});

const updatePayload = (override: Partial<PaintTexturePayload> = {}): PaintTexturePayload => ({
  mode: 'update',
  targetName: 'atlas',
  width: 16,
  height: 16,
  ops: [fillOp],
  ...override
});

{
  const { ctx } = createHarness({ noRenderer: true });
  const res = runPaintTexture(ctx, createPayload());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'not_implemented');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ mode: 'bad' as 'create' }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ name: '   ' }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, updatePayload({ targetName: '   ' }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ name: undefined }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, updatePayload({ targetName: undefined, targetId: undefined }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ width: 0 }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ width: 16.5 }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ width: 128, height: 128 }));
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    createPayload({
      uvPaint: { scope: 'bad' as 'rects' }
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ ops: {} as PaintTexturePayload['ops'] }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const ops = Array.from({ length: MAX_TEXTURE_OPS + 1 }, () => fillOp);
  const res = runPaintTexture(ctx, createPayload({ ops }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const invalidOps = JSON.parse('[{"op":"oops"}]') as PaintTexturePayload['ops'];
  const res = runPaintTexture(ctx, createPayload({ ops: invalidOps }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, updatePayload({ targetName: 'missing' }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness({
    snapshotTextures: [
      { id: 'tex1', name: 'atlas', width: 16, height: 16 },
      { id: 'tex2', name: 'duplicate', width: 16, height: 16 }
    ]
  });
  const res = runPaintTexture(
    ctx,
    updatePayload({
      targetName: 'atlas',
      name: 'duplicate'
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, createPayload({ name: 'atlas' }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    updatePayload({
      uvPaint: { source: { width: 128, height: 16 } }
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(ctx, updatePayload({ uvPaint: {} }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness({
    usageError: { code: 'invalid_state', message: 'usage read failed' }
  });
  const res = runPaintTexture(
    ctx,
    updatePayload({
      uvPaint: {},
      uvUsageId: 'any'
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('usage read failed'));
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    updatePayload({
      uvPaint: {},
      uvUsageId: 'wrong-id'
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.details?.reason, 'uv_usage_mismatch');
  }
}

{
  const usage: TextureUsageResult = {
    textures: [
      {
        id: 'tex2',
        name: 'other',
        width: 16,
        height: 16,
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 16, 16] }] }]
      }
    ]
  };
  const { ctx } = createHarness({
    usage,
    snapshotTextures: [{ id: 'tex1', name: 'atlas', width: 16, height: 16 }]
  });
  const res = runPaintTexture(
    ctx,
    updatePayload({
      uvPaint: {},
      uvUsageId: usageIdFor(usage)
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.details?.reason, 'usage_missing');
  }
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    createPayload({
      background: '#xyz'
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    createPayload({
      ops: [{ op: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: '#xyz' }]
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness();
  const res = runPaintTexture(
    ctx,
    createPayload({
      ops: [
        {
          op: 'draw_line',
          x1: 0,
          y1: 0,
          x2: 3,
          y2: 3,
          lineWidth: Number.NaN,
          color: '#ffffff'
        }
      ]
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.details?.opIndex, 0);
  }
}

{
  const usage = createUsage('atlas', [0, 0, 80, 80]);
  const { ctx } = createHarness({ usage });
  const res = runPaintTexture(
    ctx,
    updatePayload({
      uvPaint: {},
      uvUsageId: usageIdFor(usage)
    })
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { ctx } = createHarness({
    renderError: { code: 'io_error', message: 'render failed' }
  });
  const res = runPaintTexture(ctx, createPayload());
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('render failed'));
}

{
  const { ctx } = createHarness({ renderWithoutResult: true });
  const res = runPaintTexture(ctx, createPayload());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'not_implemented');
}

{
  const { ctx } = createHarness({
    updateError: { code: 'io_error', message: 'update failed' }
  });
  const res = runPaintTexture(ctx, updatePayload());
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('update failed'));
}

{
  const { ctx } = createHarness({
    importError: { code: 'io_error', message: 'import failed' }
  });
  const res = runPaintTexture(ctx, createPayload());
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.message.startsWith('import failed'));
}

{
  const { ctx, calls } = createHarness();
  const res = runPaintTexture(ctx, createPayload());
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.width, 16);
    assert.equal(res.value.height, 16);
    assert.equal(res.value.opsApplied, 1);
  }
  assert.equal(calls.importCount, 1);
}

{
  const usage = createUsage();
  const { ctx, calls } = createHarness({ usage });
  const res = runPaintTexture(
    ctx,
    {
      targetName: 'atlas',
      width: 16,
      height: 16,
      ops: [fillOp],
      uvPaint: { mapping: 'stretch' },
      uvUsageId: usageIdFor(usage)
    }
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.uvUsageId, usageIdFor(usage));
    assert.equal(res.value.opsApplied, 1);
  }
  assert.equal(calls.updateCount, 1);
}
