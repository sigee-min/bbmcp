import assert from 'node:assert/strict';

import { ProjectSession } from '../src/session';
import { ExportService } from '../src/usecases/ExportService';
import type { Capabilities, ToolError } from '../src/types';
import type { NativeCodecTarget } from '../src/ports/exporter';
import { createEditorStubWithState, createFormatPortStub } from './fakes';
import { registerAsync } from './helpers';
import {
  EXPORT_AUTHORING_NOT_ENABLED,
  EXPORT_CODEC_ID_EMPTY,
  EXPORT_CODEC_ID_FORBIDDEN,
  EXPORT_CODEC_ID_REQUIRED,
  EXPORT_CODEC_UNSUPPORTED
} from '../src/shared/messages';

type HarnessOptions = {
  capabilities?: Capabilities;
  exportPolicy?: 'strict' | 'best_effort';
  nativeError?: ToolError | null;
  gltfError?: ToolError | null;
  codecError?: ToolError | null;
  writeFileError?: ToolError | null;
  snapshotOverride?: ReturnType<ProjectSession['snapshot']>;
  ensureActiveError?: ToolError | null;
  listFormats?: Array<{ id: string; name: string }>;
  nativeCodecs?: NativeCodecTarget[];
  disableCodecExport?: boolean;
};

const baseCapabilities = (): Capabilities => ({
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
});

const createHarness = (options: HarnessOptions = {}) => {
  const session = new ProjectSession();
  const created = session.create('dragon', 'geckolib_model');
  assert.equal(created.ok, true);
  const calls = { native: 0, gltf: 0, codec: 0 };
  const editorStub = createEditorStubWithState();
  const editor = {
    ...editorStub.editor,
    writeFile: (path: string, contents: string) => {
      if (options.writeFileError) return options.writeFileError;
      editorStub.state.writes.push({ path, contents });
      return null;
    }
  };
  const service = new ExportService({
    capabilities: options.capabilities ?? baseCapabilities(),
    editor,
    exporter: {
      exportNative: () => {
        calls.native += 1;
        return options.nativeError ?? null;
      },
      exportGltf: () => {
        calls.gltf += 1;
        return options.gltfError ?? null;
      },
      ...(options.disableCodecExport
        ? {}
        : {
            exportCodec: () => {
              calls.codec += 1;
              return options.codecError ?? null;
            }
          }),
      listNativeCodecs: () => options.nativeCodecs ?? []
    },
    formats:
      options.listFormats === undefined
        ? createFormatPortStub('geckolib_model', 'GeckoLib')
        : {
            listFormats: () => options.listFormats ?? [],
            getActiveFormatId: () => null
          },
    getSnapshot: () => options.snapshotOverride ?? session.snapshot(),
    ensureActive: () => options.ensureActiveError ?? null,
    policies: {
      exportPolicy: options.exportPolicy ?? 'best_effort',
      formatOverrides: undefined
    }
  });
  return { service, writes: editorStub.state.writes, session, calls };
};

registerAsync(
  (async () => {
    {
      const { service } = createHarness();
      const res = await service.exportModel({ format: 'native_codec', destPath: 'model.obj' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'invalid_payload');
        assert.equal(res.error.message, EXPORT_CODEC_ID_REQUIRED);
      }
    }

    {
      const { service } = createHarness();
      const res = await service.exportModel({ format: 'native_codec', codecId: '   ', destPath: 'model.obj' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'invalid_payload');
        assert.equal(res.error.message, EXPORT_CODEC_ID_EMPTY);
      }
    }

    {
      const { service } = createHarness();
      const res = await service.exportModel({ format: 'gltf', codecId: 'obj', destPath: 'model.gltf' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'invalid_payload');
        assert.equal(res.error.message, EXPORT_CODEC_ID_FORBIDDEN);
      }
    }

    {
      const { service, calls } = createHarness({
        codecError: null,
        nativeCodecs: [{ id: 'obj', label: 'OBJ', extensions: ['obj'] }]
      });
      const res = await service.exportModel({ format: 'native_codec', codecId: 'obj', destPath: 'model.obj' });
      assert.equal(res.ok, true);
      assert.equal(calls.codec, 1);
      assert.equal(calls.gltf, 0);
      assert.equal(calls.native, 0);
    }

    {
      const { service } = createHarness();
      const res = await service.exportModel({ format: 'native_codec', codecId: 'obj', destPath: 'model.obj' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'unsupported_format');
        assert.equal(res.error.message, `${EXPORT_CODEC_UNSUPPORTED('obj')}.`);
      }
    }

    {
      const { service, calls } = createHarness({
        codecError: null,
        nativeCodecs: [{ id: 'gltf', label: 'glTF', extensions: ['gltf', 'glb'] }]
      });
      const res = await service.exportModel({ format: 'native_codec', codecId: '.GLB', destPath: 'model.glb' });
      assert.equal(res.ok, true);
      assert.equal(calls.codec, 1);
    }

    {
      const capabilities = baseCapabilities();
      capabilities.exportTargets = [
        { kind: 'internal', id: 'gecko_geo_anim', label: 'GeckoLib Geo+Anim JSON', available: true },
        { kind: 'gltf', id: 'gltf', label: 'glTF', extensions: ['gltf', 'glb'], available: true },
        { kind: 'native_codec', id: 'native_codec', label: 'Native Codec Export', available: true }
      ];
      const { service } = createHarness({
        capabilities,
        nativeCodecs: [
          { id: 'obj', label: 'OBJ', extensions: ['obj'] },
          { id: 'fbx', label: 'FBX', extensions: ['fbx'] }
        ]
      });
      const res = await service.exportModel({ format: 'native_codec', codecId: 'unknown', destPath: 'model.unknown' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        const details = res.error.details as
          | { requestedCodecId?: string; availableCodecs?: Array<{ id: string }> }
          | undefined;
        assert.equal(details?.requestedCodecId, 'unknown');
        assert.equal(details?.availableCodecs?.length, 2);
        assert.equal(details?.availableCodecs?.[0]?.id, 'obj');
        assert.equal(details?.availableCodecs?.[1]?.id, 'fbx');
      }
    }

    {
      const capabilities = baseCapabilities();
      capabilities.exportTargets = [
        { kind: 'internal', id: 'gecko_geo_anim', label: 'GeckoLib Geo+Anim JSON', available: true },
        { kind: 'gltf', id: 'gltf', label: 'glTF', extensions: ['gltf', 'glb'], available: true },
        { kind: 'native_codec', id: 'native_codec', label: 'Native Codec Export', available: true }
      ];
      const { service } = createHarness({ capabilities });
      const res = await service.exportModel({ format: 'native_codec', codecId: 'obj', destPath: 'model.obj' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        const recommended = res.error.details?.recommendedTarget as { id: string } | undefined;
        const availableTargets = res.error.details?.availableTargets as Array<{ id: string }> | undefined;
        assert.equal(recommended?.id, 'gecko_geo_anim');
        assert.equal(Array.isArray(availableTargets), true);
        assert.equal(availableTargets?.length, 3);
      }
    }

    {
      const { service } = createHarness({
        disableCodecExport: true,
        nativeCodecs: [{ id: 'obj', label: 'OBJ', extensions: ['obj'] }]
      });
      const res = await service.exportModel({ format: 'native_codec', codecId: 'obj', destPath: 'model.obj' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'not_implemented');
      }
    }

    {
      const capabilities = baseCapabilities();
      capabilities.authoring = { ...capabilities.authoring, enabled: false };
      const { service } = createHarness({ capabilities });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'unsupported_format');
        assert.equal(res.error.message, EXPORT_AUTHORING_NOT_ENABLED);
      }
    }

    {
      const { service } = createHarness({
        snapshotOverride: {
          ...new ProjectSession().snapshot(),
          id: 'p_override',
          formatId: 'unknown_format'
        }
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.selectedTarget?.kind, 'internal');
        assert.equal(res.value.selectedTarget?.formatId, 'unknown_format');
      }
    }

    {
      const { service } = createHarness({
        exportPolicy: 'strict',
        snapshotOverride: {
          ...new ProjectSession().snapshot(),
          id: 'p1',
          formatId: null,
          name: 'dragon'
        },
        listFormats: []
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'unsupported_format');
      }
    }

    {
      const { service } = createHarness({ nativeError: null });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.path, 'out.json');
        assert.equal(res.value.selectedTarget?.kind, 'internal');
        assert.equal(res.value.selectedTarget?.id, 'gecko_geo_anim');
        assert.equal(res.value.stage, 'done');
      }
    }

    {
      const { service } = createHarness({
        exportPolicy: 'strict',
        nativeError: { code: 'not_implemented', message: 'native unavailable' }
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'not_implemented');
      }
    }

    {
      const { service, writes } = createHarness({
        exportPolicy: 'best_effort',
        nativeError: { code: 'not_implemented', message: 'native unavailable' }
      });
      const res = await service.exportModel({
        format: 'gecko_geo_anim',
        destPath: 'out.json',
        options: { includeDiagnostics: true }
      });
      assert.equal(res.ok, true);
      assert.equal(writes.length, 2);
      assert.equal(writes[0].path, 'out.geo.json');
      assert.equal(writes[1].path, 'out.animation.json');
      if (res.ok) {
        assert.equal(res.value.path, 'out.geo.json');
        assert.equal(res.value.stage, 'fallback');
        assert.equal(res.value.warnings?.includes('native unavailable'), true);
      }
    }

    {
      const { service, writes } = createHarness({
        exportPolicy: 'best_effort',
        nativeError: { code: 'not_implemented', message: 'native unavailable' }
      });
      const res = await service.exportModel({
        format: 'gecko_geo_anim',
        destPath: 'out.json',
        options: { fallback: 'strict' }
      });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'not_implemented');
      }
      assert.equal(writes.length, 0);
    }

    {
      const { service, writes } = createHarness({
        exportPolicy: 'best_effort',
        nativeError: { code: 'io_error', message: 'disk failed' }
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'io_error');
      }
      assert.equal(writes.length, 0);
    }

    {
      const { service } = createHarness({
        exportPolicy: 'best_effort',
        nativeError: { code: 'unsupported_format', message: 'native unavailable' },
        writeFileError: { code: 'io_error', message: 'write failed' }
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'io_error');
      }
    }

    {
      const { service } = createHarness({
        ensureActiveError: { code: 'invalid_state', message: 'no active project' }
      });
      const res = await service.exportModel({ format: 'gecko_geo_anim', destPath: 'out.json' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'invalid_state');
      }
    }

    {
      const { service, calls } = createHarness({ gltfError: null });
      const res = await service.exportModel({ format: 'gltf', destPath: 'model.glb' });
      assert.equal(res.ok, true);
      assert.equal(calls.gltf, 0);
      assert.equal(calls.native, 0);
      if (res.ok) {
        assert.equal(res.value.path, 'model.gltf');
        assert.equal(res.value.stage, 'fallback');
        assert.equal(res.value.warnings?.includes('GLT-WARN-DEST_GLB_NOT_SUPPORTED'), true);
      }
    }

    {
      const { service, writes } = createHarness({
        exportPolicy: 'best_effort',
        gltfError: { code: 'not_implemented', message: 'gltf unavailable' }
      });
      const res = await service.exportModel({ format: 'gltf', destPath: 'model.gltf' });
      assert.equal(res.ok, true);
      assert.equal(writes.length, 1);
      assert.equal(writes[0]!.path, 'model.gltf');
    }
  })()
);
