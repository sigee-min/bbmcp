import {
  type CubeFaceDirection,
  type RenderPreviewPayload,
  type RenderPreviewResult,
  type ToolError,
  type TextureUsageEntry,
  type TextureUsageResult
} from '@ashfox/contracts/types/internal';
import { PREVIEW_UNSUPPORTED_NO_RENDER } from '../../../runtime/src/shared/messages';
import type { EditorPort, TextureResolution } from '../../../runtime/src/ports/editor';
import { ProjectSession } from '../../../runtime/src/session';
import type { SessionState } from '../../../runtime/src/session/types';
import type { PendingWrite } from './persistenceIo';
import {
  cloneTextureUsage,
  DEFAULT_TEXTURE_RESOLUTION,
  type EnginePersistedTextureAsset
} from './persistenceState';

const ALL_CUBE_FACES: CubeFaceDirection[] = ['north', 'south', 'east', 'west', 'up', 'down'];

const toDataUri = (image: CanvasImageSource | undefined): string | null => {
  if (!image || typeof image !== 'object') return null;
  const maybeToDataURL = (image as { toDataURL?: () => string | null }).toDataURL;
  if (typeof maybeToDataURL !== 'function') return null;
  const dataUri = maybeToDataURL();
  return typeof dataUri === 'string' && dataUri.length > 0 ? dataUri : null;
};

export class EngineEditorAdapter implements EditorPort {
  private readonly session: ProjectSession;
  private textureResolution: TextureResolution | null;
  private textureUsage: TextureUsageResult;
  private readonly textureAssets = new Map<string, EnginePersistedTextureAsset>();
  private readonly pendingWrites: PendingWrite[] = [];

  constructor(
    session: ProjectSession,
    options: {
      textureResolution: TextureResolution | null;
      textureUsage: TextureUsageResult;
      textureAssets: EnginePersistedTextureAsset[];
    }
  ) {
    this.session = session;
    this.textureResolution = options.textureResolution;
    this.textureUsage = cloneTextureUsage(options.textureUsage);
    for (const asset of options.textureAssets) {
      this.textureAssets.set(this.assetKey(asset.id, asset.name), { ...asset });
    }
    this.cleanupTextureUsage();
  }

  createProject(_name: string, _formatId: string, _options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }): ToolError | null {
    return null;
  }

  closeProject(_options?: { force?: boolean }): ToolError | null {
    const reset = this.session.reset();
    if (!reset.ok) return reset.error;
    this.textureUsage = { textures: [] };
    this.textureAssets.clear();
    return null;
  }

  importTexture(params: Parameters<EditorPort['importTexture']>[0]): ToolError | null {
    const dataUri = toDataUri(params.image);
    const key = this.assetKey(params.id, params.name);
    this.textureAssets.set(key, {
      id: params.id,
      name: params.name,
      dataUri: dataUri ?? undefined,
      width: params.width,
      height: params.height
    });
    return null;
  }

  updateTexture(params: Parameters<EditorPort['updateTexture']>[0]): ToolError | null {
    const dataUri = toDataUri(params.image);
    const target = this.resolveTexture(params.id, params.name);
    const nextId = params.id ?? target?.id;
    const nextName = params.newName ?? target?.name ?? params.name ?? 'texture';
    if (target) {
      this.textureAssets.delete(this.assetKey(target.id, target.name));
    }
    this.textureAssets.set(this.assetKey(nextId, nextName), {
      id: nextId,
      name: nextName,
      dataUri: dataUri ?? undefined,
      width: params.width ?? target?.width,
      height: params.height ?? target?.height
    });
    return null;
  }

  deleteTexture(params: Parameters<EditorPort['deleteTexture']>[0]): ToolError | null {
    const target = this.resolveTexture(params.id, params.name);
    if (target) {
      this.textureAssets.delete(this.assetKey(target.id, target.name));
      this.textureUsage.textures = this.textureUsage.textures.filter(
        (entry) => !this.textureMatches(entry, target.id, target.name)
      );
    }
    return null;
  }

  readTexture(params: Parameters<EditorPort['readTexture']>[0]): ReturnType<EditorPort['readTexture']> {
    const target = this.resolveTexture(params.id, params.name);
    if (!target) {
      return { error: { code: 'invalid_payload', message: 'Texture not found.' } };
    }
    const asset = this.resolveTextureAsset(target.id, target.name);
    if (!asset?.dataUri) {
      return {
        error: {
          code: 'invalid_state',
          message: 'Texture data is unavailable in native backend persistence.'
        }
      };
    }
    return {
      result: {
        id: target.id,
        name: target.name,
        width: target.width ?? asset.width,
        height: target.height ?? asset.height,
        dataUri: asset.dataUri,
        image: { toDataURL: () => asset.dataUri } as CanvasImageSource
      }
    };
  }

  assignTexture(params: Parameters<EditorPort['assignTexture']>[0]): ToolError | null {
    const snapshot = this.session.snapshot();
    const texture = this.resolveTexture(params.textureId, params.textureName);
    if (!texture) {
      return { code: 'invalid_payload', message: 'Texture not found for assignment.' };
    }
    const faces = this.normalizeFaces(params.faces);
    const cubes = this.resolveCubes(snapshot, params.cubeIds, params.cubeNames);
    for (const cube of cubes) {
      for (const face of faces) {
        this.removeFaceAssignments(cube.id, cube.name, face);
      }
    }
    const textureEntry = this.ensureTextureUsageEntry(texture.id, texture.name, texture.width, texture.height);
    for (const cube of cubes) {
      const usageCube = this.ensureUsageCube(textureEntry, cube.id, cube.name);
      for (const face of faces) {
        const existing = usageCube.faces.find((entry) => entry.face === face);
        if (!existing) {
          usageCube.faces.push({ face });
        }
      }
    }
    this.cleanupTextureUsage();
    return null;
  }

  setFaceUv(params: Parameters<EditorPort['setFaceUv']>[0]): ToolError | null {
    const entries = Object.entries(params.faces ?? {}) as Array<[CubeFaceDirection, [number, number, number, number]]>;
    for (const [face, uv] of entries) {
      this.setFaceUvInUsage(params.cubeId, params.cubeName, face, uv);
    }
    this.cleanupTextureUsage();
    return null;
  }

  addBone(_params: Parameters<EditorPort['addBone']>[0]): ToolError | null {
    return null;
  }

  updateBone(_params: Parameters<EditorPort['updateBone']>[0]): ToolError | null {
    return null;
  }

  deleteBone(_params: Parameters<EditorPort['deleteBone']>[0]): ToolError | null {
    return null;
  }

  addCube(_params: Parameters<EditorPort['addCube']>[0]): ToolError | null {
    return null;
  }

  updateCube(_params: Parameters<EditorPort['updateCube']>[0]): ToolError | null {
    return null;
  }

  deleteCube(_params: Parameters<EditorPort['deleteCube']>[0]): ToolError | null {
    return null;
  }

  createAnimation(_params: Parameters<EditorPort['createAnimation']>[0]): ToolError | null {
    return null;
  }

  updateAnimation(_params: Parameters<EditorPort['updateAnimation']>[0]): ToolError | null {
    return null;
  }

  deleteAnimation(_params: Parameters<EditorPort['deleteAnimation']>[0]): ToolError | null {
    return null;
  }

  setKeyframes(_params: Parameters<EditorPort['setKeyframes']>[0]): ToolError | null {
    return null;
  }

  setTriggerKeyframes(_params: Parameters<EditorPort['setTriggerKeyframes']>[0]): ToolError | null {
    return null;
  }

  renderPreview(_params: RenderPreviewPayload): { result?: RenderPreviewResult; error?: ToolError } {
    return {
      error: {
        code: 'invalid_state',
        message: PREVIEW_UNSUPPORTED_NO_RENDER
      }
    };
  }

  writeFile(path: string, contents: string): ToolError | null {
    this.pendingWrites.push({ path, contents });
    return null;
  }

  listTextures(): ReturnType<EditorPort['listTextures']> {
    const snapshot = this.session.snapshot();
    return snapshot.textures.map((texture) => ({
      id: texture.id ?? null,
      name: texture.name,
      width: texture.width ?? this.resolveTextureAsset(texture.id, texture.name)?.width ?? DEFAULT_TEXTURE_RESOLUTION.width,
      height: texture.height ?? this.resolveTextureAsset(texture.id, texture.name)?.height ?? DEFAULT_TEXTURE_RESOLUTION.height,
      ...(texture.path ? { path: texture.path } : {})
    }));
  }

  getProjectTextureResolution(): TextureResolution | null {
    return this.textureResolution ? { ...this.textureResolution } : null;
  }

  setProjectTextureResolution(width: number, height: number, _modifyUv?: boolean): ToolError | null {
    this.textureResolution = { width, height };
    return null;
  }

  setProjectUvPixelsPerBlock(_pixelsPerBlock: number): ToolError | null {
    return null;
  }

  getTextureUsage(params: Parameters<EditorPort['getTextureUsage']>[0]): ReturnType<EditorPort['getTextureUsage']> {
    const usage = cloneTextureUsage(this.textureUsage);
    if (!params.textureId && !params.textureName) {
      return { result: usage };
    }
    return {
      result: {
        textures: usage.textures.filter((entry) => this.textureMatches(entry, params.textureId, params.textureName))
      }
    };
  }

  drainPendingWrites(): PendingWrite[] {
    const writes = this.pendingWrites.splice(0, this.pendingWrites.length);
    return writes;
  }

  exportPersistenceState(): {
    textureResolution: TextureResolution | null;
    textureUsage: TextureUsageResult;
    textureAssets: EnginePersistedTextureAsset[];
  } {
    return {
      textureResolution: this.textureResolution ? { ...this.textureResolution } : null,
      textureUsage: cloneTextureUsage(this.textureUsage),
      textureAssets: Array.from(this.textureAssets.values()).map((asset) => ({ ...asset }))
    };
  }

  private normalizeFaces(faces?: CubeFaceDirection[]): CubeFaceDirection[] {
    if (!faces || faces.length === 0) return [...ALL_CUBE_FACES];
    return Array.from(new Set(faces.filter((face) => ALL_CUBE_FACES.includes(face))));
  }

  private resolveTexture(id?: string, name?: string): SessionState['textures'][number] | null {
    const snapshot = this.session.snapshot();
    return snapshot.textures.find((texture) => this.textureMatches(texture, id, name)) ?? null;
  }

  private resolveCubes(
    snapshot: SessionState,
    cubeIds?: string[],
    cubeNames?: string[]
  ): Array<{ id?: string; name: string }> {
    const idSet = new Set((cubeIds ?? []).filter((value) => typeof value === 'string' && value.length > 0));
    const nameSet = new Set((cubeNames ?? []).filter((value) => typeof value === 'string' && value.length > 0));
    return snapshot.cubes
      .filter((cube) => {
        if (idSet.size === 0 && nameSet.size === 0) return false;
        return (cube.id && idSet.has(cube.id)) || nameSet.has(cube.name);
      })
      .map((cube) => ({ id: cube.id, name: cube.name }));
  }

  private setFaceUvInUsage(
    cubeId: string | undefined,
    cubeName: string | undefined,
    face: CubeFaceDirection,
    uv: [number, number, number, number]
  ) {
    for (const texture of this.textureUsage.textures) {
      const cube = texture.cubes.find((entry) => (cubeId && entry.id === cubeId) || (cubeName && entry.name === cubeName));
      if (!cube) continue;
      const faceEntry = cube.faces.find((entry) => entry.face === face);
      if (!faceEntry) continue;
      faceEntry.uv = [uv[0], uv[1], uv[2], uv[3]];
    }
  }

  private ensureTextureUsageEntry(
    id: string | undefined,
    name: string,
    width?: number,
    height?: number
  ): TextureUsageEntry {
    const existing = this.textureUsage.textures.find((entry) => this.textureMatches(entry, id, name));
    if (existing) {
      if (width !== undefined) existing.width = width;
      if (height !== undefined) existing.height = height;
      return existing;
    }
    const created: TextureUsageEntry = {
      id,
      name,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      cubeCount: 0,
      faceCount: 0,
      cubes: []
    };
    this.textureUsage.textures.push(created);
    return created;
  }

  private ensureUsageCube(
    entry: TextureUsageEntry,
    cubeId: string | undefined,
    cubeName: string
  ): TextureUsageEntry['cubes'][number] {
    const existing = entry.cubes.find((cube) => (cubeId && cube.id === cubeId) || cube.name === cubeName);
    if (existing) return existing;
    const created: TextureUsageEntry['cubes'][number] = {
      ...(cubeId ? { id: cubeId } : {}),
      name: cubeName,
      faces: []
    };
    entry.cubes.push(created);
    return created;
  }

  private removeFaceAssignments(cubeId: string | undefined, cubeName: string, face: CubeFaceDirection) {
    for (const texture of this.textureUsage.textures) {
      const usageCube = texture.cubes.find((cube) => (cubeId && cube.id === cubeId) || cube.name === cubeName);
      if (!usageCube) continue;
      usageCube.faces = usageCube.faces.filter((entry) => entry.face !== face);
    }
  }

  private cleanupTextureUsage() {
    this.textureUsage.textures = this.textureUsage.textures
      .map((entry) => ({
        ...entry,
        cubes: entry.cubes
          .map((cube) => ({
            ...cube,
            faces: cube.faces
              .filter((face) => ALL_CUBE_FACES.includes(face.face))
              .map((face) => ({
                face: face.face,
                ...(face.uv ? { uv: [face.uv[0], face.uv[1], face.uv[2], face.uv[3]] as [number, number, number, number] } : {})
              }))
          }))
          .filter((cube) => cube.faces.length > 0)
      }))
      .filter((entry) => entry.cubes.length > 0)
      .map((entry) => ({
        ...entry,
        cubeCount: entry.cubes.length,
        faceCount: entry.cubes.reduce((sum, cube) => sum + cube.faces.length, 0)
      }));
  }

  private resolveTextureAsset(id?: string, name?: string): EnginePersistedTextureAsset | null {
    const direct = this.textureAssets.get(this.assetKey(id, name));
    if (direct) return direct;
    if (id) {
      const byId = Array.from(this.textureAssets.values()).find((asset) => asset.id === id);
      if (byId) return byId;
    }
    if (name) {
      const byName = Array.from(this.textureAssets.values()).find((asset) => asset.name === name);
      if (byName) return byName;
    }
    return null;
  }

  private assetKey(id?: string, name?: string): string {
    return `${id ?? ''}:${name ?? ''}`;
  }

  private textureMatches(entry: { id?: string; name?: string }, id?: string, name?: string): boolean {
    if (id && entry.id === id) return true;
    if (name && entry.name === name) return true;
    return false;
  }
}
