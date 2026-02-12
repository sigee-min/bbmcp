import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { SessionState } from '../src/session';
import type { Capabilities } from '../src/types';
import { resolveAnimationTimePolicy } from '../src/domain/animation/timePolicy';
import { buildInternalExport } from '../src/domain/exporters';
import { writeInternalFallbackExport } from '../src/usecases/export/writeInternalFallback';
import { ToolService } from '../src/usecases/ToolService';
import { PREVIEW_UNSUPPORTED_NO_RENDER } from '../src/shared/messages';
import {
  createEditorStubWithState,
  createExportPortStub,
  createFormatPortStub,
  createHostPortStub,
  createResourceStoreStub,
  createSnapshotPortStub,
  createTextureRendererStub,
  createTmpStoreStub
} from './fakes';
import { registerAsync } from './helpers';
import { ProjectSession } from '../src/session';

const EPSILON = 1e-6;

const normalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    Object.keys(record)
      .sort()
      .forEach((key) => {
        normalized[key] = normalizeJson(record[key]);
      });
    return normalized;
  }
  return value;
};

const stableHash = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(normalizeJson(value)))
    .digest('hex');

const assertJsonSubset = (actual: unknown, expected: unknown, path = '$') => {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path}: expected number`);
    assert.ok(Math.abs((actual as number) - expected) <= EPSILON, `${path}: numeric mismatch`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected array`);
    assert.equal((actual as unknown[]).length, expected.length, `${path}: array length mismatch`);
    expected.forEach((entry, index) => {
      assertJsonSubset((actual as unknown[])[index], entry, `${path}[${index}]`);
    });
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual), `${path}: expected object`);
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    Object.keys(expectedRecord).forEach((key) => {
      assert.ok(key in actualRecord, `${path}.${key}: missing key`);
      assertJsonSubset(actualRecord[key], expectedRecord[key], `${path}.${key}`);
    });
    return;
  }
  assert.equal(actual, expected, `${path}: value mismatch`);
};

const createBaseState = (name: string): SessionState => ({
  id: `${name}_id`,
  formatId: 'geckolib_model',
  name,
  bones: [{ name: 'root', pivot: [0, 0, 0] }],
  cubes: [{ name: 'cube', bone: 'root', from: [0, 0, 0], to: [4, 4, 4], uv: [0, 0] }],
  meshes: [],
  textures: [{ name: 'atlas', width: 64, height: 64 }],
  animations: [
    {
      name: 'idle',
      length: 1,
      loop: true,
      fps: 20,
      channels: [{ bone: 'root', channel: 'rot', keys: [{ time: 0, value: [0, 10, 0] }] }],
      triggers: []
    }
  ],
  animationTimePolicy: resolveAnimationTimePolicy()
});

// FX-001: Gecko 기본 엔티티
{
  const state = createBaseState('fx001');
  const bundle = buildInternalExport('gecko_geo_anim', state);
  const geo = bundle.artifacts.find((artifact) => artifact.id === 'geo')?.data;
  const anim = bundle.artifacts.find((artifact) => artifact.id === 'animation')?.data;
  assert.ok(geo);
  assert.ok(anim);
  assertJsonSubset(geo, {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: { identifier: 'geometry.fx001' },
        bones: [
          {
            name: 'root',
            cubes: [
              {
                origin: [-4, 0, 0],
                size: [4, 4, 4]
              }
            ]
          }
        ]
      }
    ]
  });
  assertJsonSubset(anim, {
    animations: {
      idle: {
        bones: {
          root: {
            rotation: {
              '0.0': [0, -10, 0]
            }
          }
        }
      }
    }
  });

  const editorState = createEditorStubWithState();
  const writeRes = writeInternalFallbackExport(editorState.editor, 'gecko_geo_anim', 'fx001.json', state);
  assert.equal(writeRes.ok, true);
  if (writeRes.ok) {
    assert.equal(writeRes.value.path, 'fx001.geo.json');
  }
  assert.equal(editorState.state.writes.length, 2);
  assert.equal(editorState.state.writes[0].path, 'fx001.geo.json');
  assert.equal(editorState.state.writes[1].path, 'fx001.animation.json');
}

// FX-002: 다중 본 + 트리거
{
  const state = {
    ...createBaseState('fx002'),
    bones: [
      { name: 'root', pivot: [0, 0, 0] as [number, number, number] },
      { name: 'head', parent: 'root', pivot: [0, 4, 0] as [number, number, number] }
    ],
    cubes: [
      { name: 'body', bone: 'root', from: [0, 0, 0] as [number, number, number], to: [4, 4, 4] as [number, number, number] },
      { name: 'head_cube', bone: 'head', from: [0, 4, 0] as [number, number, number], to: [2, 6, 2] as [number, number, number] }
    ],
    animations: [
      {
        name: 'walk',
        length: 2,
        loop: true,
        fps: 20,
        channels: [{ bone: 'head', channel: 'rot' as const, keys: [{ time: 1, value: [5, 0, 0] as [number, number, number] }] }],
        triggers: [
          { type: 'sound' as const, keys: [{ time: 0.25, value: 'step' }] },
          { type: 'timeline' as const, keys: [{ time: 1.25, value: 'beat' }] }
        ]
      }
    ]
  } satisfies SessionState;
  const bundle = buildInternalExport('gecko_geo_anim', state);
  const anim = bundle.artifacts.find((artifact) => artifact.id === 'animation')?.data as {
    animations: Record<string, Record<string, unknown>>;
  };
  assertJsonSubset(anim, {
    animations: {
      walk: {
        animation_length: 2,
        loop: true,
        sound_effects: { '0.25': { effect: 'step' } },
        timeline: { '1.25': 'beat' }
      }
    }
  });
}

// FX-003: Easing 메타
{
  const state = createBaseState('fx003');
  state.animations[0].channels = [
    {
      bone: 'root',
      channel: 'rot',
      keys: [
        {
          time: 0.5,
          value: [0, 20, 0],
          easing: 'easeInOutSine',
          easingArgs: [0.42],
          pre: [0, 0, 0],
          post: [0, 20, 0]
        }
      ]
    }
  ];
  const bundle = buildInternalExport('gecko_geo_anim', state);
  const anim = bundle.artifacts.find((artifact) => artifact.id === 'animation')?.data as {
    animations: Record<string, { bones: Record<string, { rotation: Record<string, unknown> }> }>;
  };
  const key = anim.animations.idle.bones.root.rotation['0.5'] as Record<string, unknown>;
  assertJsonSubset(key, {
    pre: [0, 0, 0],
    post: [0, -20, 0],
    easing: 'easeInOutSine',
    easingArgs: [0.42]
  });
}

// FX-006: No-Render 실행
registerAsync(
  (async () => {
    const session = new ProjectSession();
    const editorState = createEditorStubWithState();
    const capabilities: Capabilities = {
      pluginVersion: 'test',
      blockbenchVersion: 'test',
      authoring: { animations: true, enabled: true  },
      limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
    };
    const service = new ToolService({
      session,
      capabilities,
      editor: editorState.editor,
      formats: createFormatPortStub('geckolib_model', 'GeckoLib'),
      snapshot: createSnapshotPortStub(session),
      exporter: createExportPortStub('not_implemented'),
      host: createHostPortStub(),
      textureRenderer: createTextureRendererStub(),
      tmpStore: createTmpStoreStub(),
      resources: createResourceStoreStub(),
      policies: {
        autoAttachActiveProject: true,
        exportPolicy: 'best_effort',
        allowRenderPreview: false
      }
    });

    const ensureRes = service.ensureProject({ name: 'fx006', onMissing: 'create' });
    assert.equal(ensureRes.ok, true);
    assert.equal(service.addBone({ name: 'root' }).ok, true);
    assert.equal(service.addCube({ name: 'cube', bone: 'root', from: [0, 0, 0], to: [2, 2, 2] }).ok, true);
    assert.equal(service.createAnimationClip({ name: 'idle', length: 1, loop: true, fps: 20 }).ok, true);
    assert.equal(service.setFramePose({ clip: 'idle', frame: 0, bones: [{ name: 'root', rot: [1, 0, 0] }] }).ok, true);

    const exportFirst = await service.exportModel({
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    });
    assert.equal(exportFirst.ok, true);
    if (exportFirst.ok) {
      assert.equal(exportFirst.value.path, 'fx006.geo.json');
      assert.equal(exportFirst.value.stage, 'fallback');
    }
    assert.equal(editorState.state.writes.length, 2);
    const firstBatch = editorState.state.writes.slice(0, 2);

    const exportSecond = await service.exportModel({
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    });
    assert.equal(exportSecond.ok, true);
    assert.equal(editorState.state.writes.length, 4);
    const secondBatch = editorState.state.writes.slice(2, 4);

    const firstHash = stableHash(firstBatch);
    const secondHash = stableHash(secondBatch);
    assert.equal(firstHash, secondHash);

    const validateRes = service.validate({});
    assert.equal(validateRes.ok, true);

    const previewRes = service.renderPreview({ mode: 'fixed' });
    assert.equal(previewRes.ok, false);
    if (!previewRes.ok) {
      assert.equal(previewRes.error.code, 'not_implemented');
      assert.equal(previewRes.error.message.includes(PREVIEW_UNSUPPORTED_NO_RENDER), true);
    }
  })()
);
