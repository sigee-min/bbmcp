import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { SessionState } from '../src/session';
import type { Capabilities, ExportResult, ToolError } from '/contracts/types/internal';
import { keyframeTimeBucket } from '../src/domain/animation/keyframes';
import { writeInternalFallbackExport } from '../src/usecases/export/writeInternalFallback';
import { ExportService } from '../src/usecases/ExportService';
import { ToolService } from '../src/usecases/ToolService';
import { ProjectSession } from '../src/session';
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

const EPSILON = 1e-6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

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

const sha256Bytes = (bytes: Uint8Array): string =>
  createHash('sha256')
    .update(bytes)
    .digest('hex');

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const isNumericKey = (key: string): boolean => /^-?\d+(\.\d+)?$/.test(key);

const isTimeKeyMap = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(isNumericKey);
};

const assertJsonEqual = (
  actual: unknown,
  expected: unknown,
  options: { path?: string; timePolicy?: unknown } = {}
) => {
  const where = options.path ?? '$';

  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${where}: expected number`);
    assert.ok(Math.abs((actual as number) - expected) <= EPSILON, `${where}: numeric mismatch`);
    return;
  }

  if (expected === null || typeof expected === 'boolean' || typeof expected === 'string') {
    assert.equal(actual, expected, `${where}: value mismatch`);
    return;
  }

  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where}: expected array`);
    assert.equal((actual as unknown[]).length, expected.length, `${where}: array length mismatch`);
    expected.forEach((entry, index) => {
      assertJsonEqual((actual as unknown[])[index], entry, {
        ...options,
        path: `${where}[${index}]`
      });
    });
    return;
  }

  assert.ok(isRecord(expected), `${where}: expected object`);
  assert.ok(isRecord(actual), `${where}: expected object`);

  if (isTimeKeyMap(expected) && isTimeKeyMap(actual) && options.timePolicy) {
    const expectedBuckets = new Map<number, unknown>();
    for (const [key, value] of Object.entries(expected)) {
      const time = Number.parseFloat(key);
      const bucket = keyframeTimeBucket(time, options.timePolicy as never);
      assert.ok(!expectedBuckets.has(bucket), `${where}: duplicate expected time bucket`);
      expectedBuckets.set(bucket, value);
    }
    const actualBuckets = new Map<number, unknown>();
    for (const [key, value] of Object.entries(actual)) {
      const time = Number.parseFloat(key);
      const bucket = keyframeTimeBucket(time, options.timePolicy as never);
      assert.ok(!actualBuckets.has(bucket), `${where}: duplicate actual time bucket`);
      actualBuckets.set(bucket, value);
    }

    const expectedKeys = [...expectedBuckets.keys()].sort((a, b) => a - b);
    const actualKeys = [...actualBuckets.keys()].sort((a, b) => a - b);
    assert.deepEqual(actualKeys, expectedKeys, `${where}: time bucket keys mismatch`);
    for (const bucket of expectedKeys) {
      assertJsonEqual(actualBuckets.get(bucket), expectedBuckets.get(bucket), {
        ...options,
        path: `${where}[bucket:${bucket}]`
      });
    }
    return;
  }

  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  assert.deepEqual(actualKeys, expectedKeys, `${where}: object keys mismatch`);
  for (const key of expectedKeys) {
    assertJsonEqual(actual[key], expected[key], {
      ...options,
      path: `${where}.${key}`
    });
  }
};

const assertToolErrorMatches = (actual: ToolError, expected: { code: string; message?: string }, where: string) => {
  assert.equal(actual.code, expected.code, `${where}.code: mismatch`);
  if (expected.message) {
    assert.equal(
      actual.message.includes(expected.message),
      true,
      `${where}.message: expected to include "${expected.message}"`
    );
  }
};

const decodeDataUriBytes = (uri: string): Uint8Array => {
  const raw = String(uri ?? '');
  const match = /^data:([^;]+);base64,(.*)$/i.exec(raw);
  assert.ok(match, `invalid data URI: ${raw.slice(0, 48)}...`);
  const base64 = match![2]!.trim().replace(/\s/g, '');
  return Buffer.from(base64, 'base64');
};

type GltfUriRef = { uri?: string };

type GltfUriDoc = {
  buffers?: GltfUriRef[];
  images?: GltfUriRef[];
};

const sanitizeGltfUrisForJsonCompare = (value: unknown): unknown => {
  const clone = JSON.parse(JSON.stringify(value)) as GltfUriDoc & Record<string, unknown>;
  if (clone && typeof clone === 'object') {
    if (Array.isArray(clone.buffers)) {
      clone.buffers.forEach((buf) => {
        if (buf && typeof buf === 'object' && 'uri' in buf) buf.uri = '__IGNORED_DATA_URI__';
      });
    }
    if (Array.isArray(clone.images)) {
      clone.images.forEach((img) => {
        if (img && typeof img === 'object' && 'uri' in img) img.uri = '__IGNORED_DATA_URI__';
      });
    }
  }
  return clone;
};

const runInternalExportFixture = (fixtureId: string, fixtureDir: string) => {
  const expectedDir = path.join(fixtureDir, 'expected');
  const state = readJson(path.join(fixtureDir, 'state.json')) as SessionState;
  const match = fixtureId.match(/^FX-(\d+)$/);
  assert.ok(match, `invalid fixture id: ${fixtureId}`);
  const suffix = match[1]!;
  const destBase = `fx${suffix}`;
  const destPath = `${destBase}.json`;

  const editorState = createEditorStubWithState();
  const res = writeInternalFallbackExport(editorState.editor, 'gecko_geo_anim', destPath, state);
  assert.equal(res.ok, true, `${fixtureId}: export failed`);
  if (!res.ok) return;

  const expectedResult = readJson(path.join(expectedDir, 'result.json'));
  assertJsonEqual(res.value, expectedResult, { path: `${fixtureId}.result`, timePolicy: state.animationTimePolicy });

  const expectedWarnings = readJson(path.join(expectedDir, 'warnings.json'));
  assertJsonEqual(res.value.warnings ?? [], expectedWarnings, { path: `${fixtureId}.warnings` });

  const exportFiles = fs
    .readdirSync(expectedDir)
    .filter((name) => name.endsWith('.geo.json') || name.endsWith('.animation.json'));
  const actualByName = new Map<string, { path: string; contents: string }>();
  for (const write of editorState.state.writes) {
    actualByName.set(path.basename(write.path), write);
  }

  assert.equal(
    editorState.state.writes.length,
    exportFiles.length,
    `${fixtureId}: unexpected number of exported files`
  );

  for (const fileName of exportFiles) {
    const expectedJson = readJson(path.join(expectedDir, fileName));
    const write = actualByName.get(fileName);
    assert.ok(write, `${fixtureId}: missing export file ${fileName}`);
    const actualJson = JSON.parse(write!.contents);
    assertJsonEqual(actualJson, expectedJson, { path: `${fixtureId}.${fileName}`, timePolicy: state.animationTimePolicy });
  }

  const secondEditor = createEditorStubWithState();
  const second = writeInternalFallbackExport(secondEditor.editor, 'gecko_geo_anim', destPath, state);
  assert.equal(second.ok, true, `${fixtureId}: second export failed`);
  if (!second.ok) return;
  assert.equal(stableHash(editorState.state.writes), stableHash(secondEditor.state.writes), `${fixtureId}: hash drift`);
  assert.equal(stableHash(res.value), stableHash(second.value), `${fixtureId}: result drift`);
};

const baseCapabilities = (): Capabilities => ({
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true },
  limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
});

const runNativeCodecFixture = async (fixtureId: string, fixtureDir: string, codecId: string) => {
  const expectedDir = path.join(fixtureDir, 'expected');
  const state = readJson(path.join(fixtureDir, 'state.json')) as SessionState;
  const match = fixtureId.match(/^FX-(\d+)$/);
  assert.ok(match, `invalid fixture id: ${fixtureId}`);
  const suffix = match[1]!;
  const destPath = `fx${suffix}.json`;

  const session = new ProjectSession();
  const attachRes = session.attach(state);
  assert.equal(attachRes.ok, true, `${fixtureId}: attach failed`);

  const editorState = createEditorStubWithState();
  const calls = { codec: 0 };
  const service = new ExportService({
    capabilities: baseCapabilities(),
    editor: editorState.editor,
    exporter: {
      exportNative: () => ({ code: 'invalid_state', message: 'export not implemented' }),
      exportGltf: () => ({ code: 'invalid_state', message: 'export not implemented' }),
      exportCodec: () => {
        calls.codec += 1;
        return null;
      },
      listNativeCodecs: () => [{ id: codecId, label: codecId, extensions: ['json'] }]
    },
    formats: createFormatPortStub('geckolib_model', 'GeckoLib'),
    getSnapshot: () => session.snapshot(),
    ensureActive: () => session.ensureActive(),
    policies: {
      exportPolicy: 'best_effort',
      formatOverrides: undefined
    }
  });

  const res = await service.exportModel({ format: 'native_codec', codecId, destPath });
  assert.equal(res.ok, true, `${fixtureId}: export failed`);
  if (!res.ok) return;
  assert.equal(calls.codec, 1, `${fixtureId}: expected exporter.exportCodec to be called once`);

  const expectedResult = readJson(path.join(expectedDir, 'result.json'));
  assertJsonEqual(res.value, expectedResult, { path: `${fixtureId}.result` });

  const second = await service.exportModel({ format: 'native_codec', codecId, destPath });
  assert.equal(second.ok, true, `${fixtureId}: second export failed`);
  if (!second.ok) return;
  assert.equal(stableHash(res.value), stableHash(second.value), `${fixtureId}: result drift`);
};

const runGltfFixture = async (fixtureId: string, fixtureDir: string) => {
  const expectedDir = path.join(fixtureDir, 'expected');
  const state = readJson(path.join(fixtureDir, 'state.json')) as SessionState;
  const match = fixtureId.match(/^FX-(\d+)$/);
  assert.ok(match, `invalid fixture id: ${fixtureId}`);
  const suffix = match[1]!;
  const destPath = `fx${suffix}.gltf`;

  const session = new ProjectSession();
  const attachRes = session.attach(state);
  assert.equal(attachRes.ok, true, `${fixtureId}: attach failed`);

  const createService = (editorState: ReturnType<typeof createEditorStubWithState>) => {
    const calls = { native: 0, gltf: 0 };
    const service = new ExportService({
      capabilities: baseCapabilities(),
      editor: editorState.editor,
      exporter: {
        exportNative: () => {
          calls.native += 1;
          return { code: 'invalid_state', message: 'export not implemented' };
        },
        exportGltf: () => {
          calls.gltf += 1;
          return { code: 'invalid_state', message: 'export not implemented' };
        }
      },
      formats: createFormatPortStub('geckolib_model', 'GeckoLib'),
      getSnapshot: () => session.snapshot(),
      ensureActive: () => session.ensureActive(),
      policies: {
        exportPolicy: 'best_effort',
        formatOverrides: undefined
      }
    });
    return { service, calls };
  };

  const editorState = createEditorStubWithState({ readTextureDataUri: '' });
  const { service, calls } = createService(editorState);
  const res = await service.exportModel({ format: 'gltf', destPath });
  assert.equal(res.ok, true, `${fixtureId}: export failed`);
  if (!res.ok) return;
  assert.equal(calls.gltf, 0, `${fixtureId}: host exporter.exportGltf should not be called`);
  assert.equal(calls.native, 0, `${fixtureId}: exporter.exportNative should not be called`);

  const expectedResult = readJson(path.join(expectedDir, 'result.json'));
  assertJsonEqual(res.value, expectedResult, { path: `${fixtureId}.result` });
  const expectedWarnings = readJson(path.join(expectedDir, 'warnings.json'));
  assertJsonEqual(res.value.warnings ?? [], expectedWarnings, { path: `${fixtureId}.warnings` });

  assert.equal(editorState.state.writes.length, 1, `${fixtureId}: expected 1 output file`);
  assert.equal(path.basename(editorState.state.writes[0]!.path), destPath, `${fixtureId}: output file name mismatch`);
  const actualGltf = JSON.parse(editorState.state.writes[0]!.contents) as GltfUriDoc & Record<string, unknown>;

  const expectedGltf = readJson(path.join(expectedDir, destPath));
  assertJsonEqual(
    sanitizeGltfUrisForJsonCompare(actualGltf),
    sanitizeGltfUrisForJsonCompare(expectedGltf),
    { path: `${fixtureId}.${destPath}` }
  );

  const expectedSha = readJson(path.join(expectedDir, 'expected.gltf.sha256.json')) as {
    buffer0_sha256: string;
    [key: string]: string;
  };

  const actualBufferUri = actualGltf?.buffers?.[0]?.uri;
  assert.equal(typeof actualBufferUri, 'string', `${fixtureId}: missing buffers[0].uri`);
  if (typeof actualBufferUri !== 'string') return;
  const actualBufferSha = sha256Bytes(decodeDataUriBytes(actualBufferUri));
  assert.equal(actualBufferSha, expectedSha.buffer0_sha256, `${fixtureId}: buffer0_sha256 mismatch`);

  const actualImages = Array.isArray(actualGltf?.images) ? actualGltf.images : [];
  actualImages.forEach((img, index) => {
    const uri = img?.uri;
    assert.equal(typeof uri, 'string', `${fixtureId}: missing images[${index}].uri`);
    if (typeof uri !== 'string') return;
    const key = `image${index}_sha256`;
    assert.ok(typeof expectedSha[key] === 'string', `${fixtureId}: missing expected ${key}`);
    assert.equal(sha256Bytes(decodeDataUriBytes(uri)), expectedSha[key]!, `${fixtureId}: ${key} mismatch`);
  });

  // Determinism check: second export should match.
  const secondEditor = createEditorStubWithState({ readTextureDataUri: '' });
  const { service: secondService } = createService(secondEditor);
  const second = await secondService.exportModel({ format: 'gltf', destPath });
  assert.equal(second.ok, true, `${fixtureId}: second export failed`);
  if (!second.ok) return;
  assert.equal(stableHash(editorState.state.writes), stableHash(secondEditor.state.writes), `${fixtureId}: hash drift`);
  assert.equal(stableHash(res.value), stableHash(second.value), `${fixtureId}: result drift`);
};

const runNoRenderFixture = async (fixtureId: string, fixtureDir: string) => {
  const expectedDir = path.join(fixtureDir, 'expected');
  const expectedState = readJson(path.join(fixtureDir, 'state.json')) as SessionState;
  const destPath = 'fx006.json';

  const session = new ProjectSession();
  const editorState = createEditorStubWithState();
  const service = new ToolService({
    session,
    capabilities: baseCapabilities(),
    editor: editorState.editor,
    formats: createFormatPortStub('geckolib_model', 'GeckoLib'),
    snapshot: createSnapshotPortStub(session),
    exporter: createExportPortStub('invalid_state'),
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

  assert.equal(service.ensureProject({ name: 'fx006', onMissing: 'create' }).ok, true, `${fixtureId}: ensure failed`);
  assert.equal(service.addBone({ name: 'root' }).ok, true, `${fixtureId}: addBone failed`);
  assert.equal(
    service.addCube({ name: 'cube', bone: 'root', from: [0, 0, 0], to: [2, 2, 2] }).ok,
    true,
    `${fixtureId}: addCube failed`
  );
  assert.equal(
    service.createAnimationClip({ name: 'idle', length: 1, loop: true, fps: 20 }).ok,
    true,
    `${fixtureId}: createAnimation failed`
  );
  assert.equal(
    service.setFramePose({ clip: 'idle', frame: 0, bones: [{ name: 'root', rot: [1, 0, 0] }] }).ok,
    true,
    `${fixtureId}: setFramePose failed`
  );

  const exportFirst = await service.exportModel({
    format: 'gecko_geo_anim',
    destPath,
    options: { includeDiagnostics: true }
  });
  assert.equal(exportFirst.ok, true, `${fixtureId}: export failed`);
  if (!exportFirst.ok) return;

  const expectedResult = readJson(path.join(expectedDir, 'result.json')) as ExportResult;
  assertJsonEqual(exportFirst.value, expectedResult, { path: `${fixtureId}.result` });
  const expectedWarnings = readJson(path.join(expectedDir, 'warnings.json')) as string[];
  assertJsonEqual(exportFirst.value.warnings ?? [], expectedWarnings, { path: `${fixtureId}.warnings` });

  const exportFiles = fs
    .readdirSync(expectedDir)
    .filter((name) => name.endsWith('.geo.json') || name.endsWith('.animation.json'));
  const actualWrites = editorState.state.writes.slice(0, 2);
  assert.equal(actualWrites.length, 2, `${fixtureId}: expected 2 output files from first export`);
  for (const fileName of exportFiles) {
    const expectedJson = readJson(path.join(expectedDir, fileName));
    const found = actualWrites.find((write) => path.basename(write.path) === fileName);
    assert.ok(found, `${fixtureId}: missing export file ${fileName}`);
    const actualJson = JSON.parse(found!.contents);
    assertJsonEqual(actualJson, expectedJson, { path: `${fixtureId}.${fileName}`, timePolicy: expectedState.animationTimePolicy });
  }

  const exportSecond = await service.exportModel({
    format: 'gecko_geo_anim',
    destPath,
    options: { includeDiagnostics: true }
  });
  assert.equal(exportSecond.ok, true, `${fixtureId}: second export failed`);
  if (!exportSecond.ok) return;
  const secondWrites = editorState.state.writes.slice(2, 4);
  assert.equal(secondWrites.length, 2, `${fixtureId}: expected 2 output files from second export`);
  assert.equal(stableHash(actualWrites), stableHash(secondWrites), `${fixtureId}: export hash drift`);

  const validateRes = service.validate({});
  assert.equal(validateRes.ok, true, `${fixtureId}: validate failed`);

  const previewRes = service.renderPreview({ mode: 'fixed' });
  assert.equal(previewRes.ok, false, `${fixtureId}: preview should be unsupported`);
  if (!previewRes.ok) {
    const expectedPreviewErr = readJson(path.join(expectedDir, 'preview_error.json')) as { code: string; message: string };
    assertToolErrorMatches(previewRes.error, expectedPreviewErr, `${fixtureId}.preview`);
    assert.equal(previewRes.error.message.includes(PREVIEW_UNSUPPORTED_NO_RENDER), true, `${fixtureId}: preview message mismatch`);
  }
};

registerAsync(
  (async () => {
    const fixturesRoot = path.join(__dirname, 'oracle', 'fixtures');
    const fixtures = fs
      .readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('FX-'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const fixtureId of fixtures) {
      const fixtureDir = path.join(fixturesRoot, fixtureId);
      if (fixtureId === 'FX-001' || fixtureId === 'FX-002' || fixtureId === 'FX-003') {
        runInternalExportFixture(fixtureId, fixtureDir);
        continue;
      }
      if (fixtureId === 'FX-004') {
        await runNativeCodecFixture(fixtureId, fixtureDir, 'java_block_item_json');
        continue;
      }
      if (fixtureId === 'FX-005') {
        await runNativeCodecFixture(fixtureId, fixtureDir, 'animated_java');
        continue;
      }
      if (fixtureId === 'FX-006') {
        await runNoRenderFixture(fixtureId, fixtureDir);
        continue;
      }
      if (fixtureId === 'FX-007') {
        await runGltfFixture(fixtureId, fixtureDir);
        continue;
      }
      throw new Error(`Unhandled oracle fixture: ${fixtureId}`);
    }
  })()
);
