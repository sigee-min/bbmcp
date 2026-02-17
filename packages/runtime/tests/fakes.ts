import type {
  AnimationCommand,
  AssignTextureCommand,
  BoneCommand,
  CubeCommand,
  DeleteAnimationCommand,
  DeleteBoneCommand,
  DeleteCubeCommand,
  DeleteTextureCommand,
  EditorPort,
  ImportTextureCommand,
  KeyframeCommand,
  ReadTextureCommand,
  SetFaceUvCommand,
  TextureSource,
  TextureStat,
  TextureUsageQuery,
  TextureUsageResult,
  UpdateAnimationCommand,
  UpdateBoneCommand,
  UpdateCubeCommand,
  UpdateTextureCommand,
  TriggerKeyframeCommand
} from '../src/ports/editor';
import type { ExportPort } from '../src/ports/exporter';
import type { FormatPort } from '../src/ports/formats';
import type { HostPort } from '../src/ports/host';
import type { ResourceStore, ResourceContent, ResourceDescriptor, ResourceTemplate } from '../src/ports/resources';
import type { SnapshotPort } from '../src/ports/snapshot';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { TmpSaveResult, TmpStorePort } from '../src/ports/tmpStore';
import type { ProjectSession } from '../src/session';
import type { RenderPreviewResult, ToolError } from '../src/types';

type EditorStubState = {
  textures: TextureStat[];
  textureResolution: { width: number; height: number } | null;
  textureUsage: TextureUsageResult;
  previewResult: RenderPreviewResult;
  readTextureDataUri: string;
  writes: Array<{ path: string; contents: string }>;
};

export const createMockImage = (dataUri = 'data:image/png;base64,AAAA') =>
  ({
    toDataURL: () => dataUri
  }) as CanvasImageSource;

const buildEditorStub = (state: EditorStubState): EditorPort => {

  const findTexture = (params: { id?: string; name?: string }) =>
    state.textures.find((tex) => (params.id && tex.id === params.id) || (params.name && tex.name === params.name));

  const upsertTexture = (entry: TextureStat) => {
    const idx = state.textures.findIndex((tex) => (entry.id && tex.id === entry.id) || tex.name === entry.name);
    if (idx >= 0) {
      state.textures[idx] = { ...state.textures[idx], ...entry };
      return;
    }
    state.textures.push(entry);
  };

  const removeTexture = (params: { id?: string; name?: string }) => {
    state.textures = state.textures.filter(
      (tex) => !((params.id && tex.id === params.id) || (params.name && tex.name === params.name))
    );
  };

  return {
    createProject: (_name: string, _formatId: string) => null,
    closeProject: (_options?: { force?: boolean }) => null,
    importTexture: (params: ImportTextureCommand): ToolError | null => {
      upsertTexture({
        id: params.id ?? null,
        name: params.name,
        width: params.width ?? 16,
        height: params.height ?? 16,
        path: params.path
      });
      return null;
    },
    updateTexture: (params: UpdateTextureCommand): ToolError | null => {
      const target = findTexture({ id: params.id, name: params.name ?? params.newName });
      const nextName = params.newName ?? target?.name ?? params.name ?? 'texture';
      upsertTexture({
        id: params.id ?? target?.id ?? null,
        name: nextName,
        width: params.width ?? target?.width ?? 16,
        height: params.height ?? target?.height ?? 16,
        path: target?.path
      });
      return null;
    },
    deleteTexture: (params: DeleteTextureCommand): ToolError | null => {
      removeTexture({ id: params.id, name: params.name });
      return null;
    },
    readTexture: (params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } => {
      const target = findTexture({ id: params.id, name: params.name });
      if (!target) return { error: { code: 'invalid_payload', message: 'missing texture' } };
      return {
        result: {
          id: target.id ?? undefined,
          name: target.name,
          width: target.width,
          height: target.height,
          dataUri: state.readTextureDataUri,
          image: createMockImage(state.readTextureDataUri)
        }
      };
    },
    assignTexture: (_params: AssignTextureCommand) => null,
    setFaceUv: (_params: SetFaceUvCommand) => null,
    addBone: (_params: BoneCommand) => null,
    updateBone: (_params: UpdateBoneCommand) => null,
    deleteBone: (_params: DeleteBoneCommand) => null,
    addCube: (_params: CubeCommand) => null,
    updateCube: (_params: UpdateCubeCommand) => null,
    deleteCube: (_params: DeleteCubeCommand) => null,
    createAnimation: (_params: AnimationCommand) => null,
    updateAnimation: (_params: UpdateAnimationCommand) => null,
    deleteAnimation: (_params: DeleteAnimationCommand) => null,
    setKeyframes: (_params: KeyframeCommand) => null,
    setTriggerKeyframes: (_params: TriggerKeyframeCommand) => null,
    renderPreview: (_params) => ({ result: state.previewResult }),
    writeFile: (path: string, contents: string) => {
      state.writes.push({ path, contents });
      return null;
    },
    listTextures: () => [...state.textures],
    getProjectTextureResolution: () => state.textureResolution,
    setProjectTextureResolution: (width: number, height: number) => {
      state.textureResolution = { width, height };
      return null;
    },
    setProjectUvPixelsPerBlock: (_pixelsPerBlock: number) => null,
    getTextureUsage: (_params: TextureUsageQuery) => ({ result: state.textureUsage })
  };
};

const defaultEditorState = (): EditorStubState => ({
  textures: [],
  textureResolution: { width: 16, height: 16 },
  textureUsage: { textures: [] },
  previewResult: {
    kind: 'single',
    frameCount: 1,
    image: { mime: 'image/png', width: 16, height: 16, dataUri: 'data:image/png;base64,AAAA' }
  },
  readTextureDataUri: 'data:image/png;base64,AAAA',
  writes: []
});

export const createEditorStub = (stateOverrides: Partial<EditorStubState> = {}): EditorPort => {
  const state: EditorStubState = { ...defaultEditorState(), ...stateOverrides };
  return buildEditorStub(state);
};

export const createEditorStubWithState = (stateOverrides: Partial<EditorStubState> = {}) => {
  const state: EditorStubState = { ...defaultEditorState(), ...stateOverrides };
  return { editor: buildEditorStub(state), state };
};

export const createFormatPortStub = (
  formatId = 'entity_rig',
  name = 'Entity Rig',
  caps: { singleTexture?: boolean; perTextureUvSize?: boolean } = {}
): FormatPort => ({
  listFormats: () => [{ id: formatId, name, ...caps }],
  getActiveFormatId: () => formatId
});

export const createSnapshotPortStub = (session: ProjectSession, override?: () => ReturnType<ProjectSession['snapshot']> | null): SnapshotPort => ({
  readSnapshot: () => (override ? override() : session.snapshot())
});

export const createExportPortStub = (
  mode: 'ok' | 'invalid_state' = 'invalid_state'
): ExportPort => ({
  exportNative: () =>
    mode === 'ok'
      ? null
      : {
          code: 'invalid_state',
          message: 'export not implemented'
        },
  exportGltf: () =>
    mode === 'ok'
      ? null
      : {
          code: 'invalid_state',
          message: 'export not implemented'
        }
});

export const createHostPortStub = (): HostPort => ({
  schedulePluginReload: (_delayMs: number) => null
});

export const createTextureRendererStub = (): TextureRendererPort => ({
  renderPixels: ({ width, height }) => ({
    result: {
      image: createMockImage('data:image/png;base64,BBBB'),
      width,
      height
    }
  }),
  readPixels: ({ width = 1, height = 1 }) => ({
    result: {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    }
  })
});

export const createTmpStoreStub = (): TmpStorePort => ({
  saveDataUri: (dataUri: string, options?: { nameHint?: string; prefix?: string; cwd?: string }) => {
    const byteLength = dataUri.length;
    const name = options?.nameHint ?? 'tmp';
    const prefix = options?.prefix ?? 'tmp';
    const data: TmpSaveResult = {
      path: `${prefix}_${name}.png`,
      mimeType: 'image/png',
      byteLength
    };
    return { ok: true, data };
  }
});

export const createResourceStoreStub = (): ResourceStore => {
  const store = new Map<string, ResourceContent>();
  return {
    list: (): ResourceDescriptor[] => Array.from(store.values()).map((res) => ({
      uri: res.uri,
      name: res.name,
      mimeType: res.mimeType,
      description: res.description
    })),
    read: (uri: string) => store.get(uri) ?? null,
    listTemplates: (): ResourceTemplate[] => [],
    has: (uri: string) => store.has(uri),
    put: (resource: ResourceContent) => {
      store.set(resource.uri, resource);
    }
  };
};
