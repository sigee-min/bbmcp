import type { PersistedProjectRecord } from '@ashfox/backend-core';
import type { TextureUsageEntry, TextureUsageResult } from '@ashfox/contracts/types/internal';
import { resolveAnimationTimePolicy } from '../../../runtime/src/domain/animation/timePolicy';
import type { TextureResolution } from '../../../runtime/src/ports/editor';
import { ProjectSession } from '../../../runtime/src/session';
import type { SessionState } from '../../../runtime/src/session/types';

const ENGINE_STATE_VERSION = 1;
export const DEFAULT_TEXTURE_RESOLUTION: TextureResolution = { width: 16, height: 16 };

export type EnginePersistedTextureAsset = {
  id?: string;
  name: string;
  dataUri?: string;
  width?: number;
  height?: number;
};

export type EnginePersistedStateEnvelope = {
  version: number;
  session: SessionState;
  textureResolution?: TextureResolution | null;
  textureUsage?: TextureUsageResult;
  textureAssets?: EnginePersistedTextureAsset[];
};

export type LoadedPersistedState = {
  session: SessionState;
  textureResolution: TextureResolution | null;
  textureUsage: TextureUsageResult;
  textureAssets: EnginePersistedTextureAsset[];
};

export type EnginePersistenceState = {
  textureResolution: TextureResolution | null;
  textureUsage: TextureUsageResult;
  textureAssets: EnginePersistedTextureAsset[];
};

type EnginePersistenceStateReader = {
  exportPersistenceState: () => EnginePersistenceState;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const hasProjectData = (snapshot: SessionState): boolean =>
  Boolean(
    snapshot.id ||
      snapshot.formatId ||
      snapshot.name ||
      snapshot.bones.length > 0 ||
      snapshot.cubes.length > 0 ||
      (snapshot.meshes?.length ?? 0) > 0 ||
      snapshot.textures.length > 0 ||
      snapshot.animations.length > 0
  );

export const cloneTextureUsage = (usage: TextureUsageResult): TextureUsageResult => ({
  textures: (usage.textures ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    width: entry.width,
    height: entry.height,
    cubeCount: entry.cubeCount,
    faceCount: entry.faceCount,
    cubes: (entry.cubes ?? []).map((cube) => ({
      id: cube.id,
      name: cube.name,
      faces: (cube.faces ?? []).map((face) => ({
        face: face.face,
        ...(face.uv ? { uv: [face.uv[0], face.uv[1], face.uv[2], face.uv[3]] as [number, number, number, number] } : {})
      }))
    }))
  })),
  ...(usage.unresolved && usage.unresolved.length > 0
    ? {
        unresolved: usage.unresolved.map((entry) => ({
          textureRef: entry.textureRef,
          cubeId: entry.cubeId,
          cubeName: entry.cubeName,
          face: entry.face
        }))
      }
    : {})
});

const asTextureResolution = (value: unknown): TextureResolution | null => {
  if (!isRecord(value)) return null;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width: Math.trunc(width),
    height: Math.trunc(height)
  };
};

const asSessionState = (value: unknown): SessionState => {
  const empty = new ProjectSession().snapshot();
  if (!isRecord(value)) return empty;
  const candidate = value as Partial<SessionState> & Record<string, unknown>;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : candidate.id === null ? null : empty.id,
    formatId:
      typeof candidate.formatId === 'string'
        ? candidate.formatId
        : candidate.formatId === null
          ? null
          : empty.formatId ?? null,
    name: typeof candidate.name === 'string' ? candidate.name : candidate.name === null ? null : empty.name,
    dirty: typeof candidate.dirty === 'boolean' ? candidate.dirty : undefined,
    uvPixelsPerBlock:
      typeof candidate.uvPixelsPerBlock === 'number' && Number.isFinite(candidate.uvPixelsPerBlock)
        ? candidate.uvPixelsPerBlock
        : undefined,
    bones: Array.isArray(candidate.bones) ? (candidate.bones as SessionState['bones']) : [],
    cubes: Array.isArray(candidate.cubes) ? (candidate.cubes as SessionState['cubes']) : [],
    meshes: Array.isArray(candidate.meshes) ? (candidate.meshes as SessionState['meshes']) : [],
    textures: Array.isArray(candidate.textures) ? (candidate.textures as SessionState['textures']) : [],
    animations: Array.isArray(candidate.animations) ? (candidate.animations as SessionState['animations']) : [],
    animationsStatus: candidate.animationsStatus === 'unavailable' ? 'unavailable' : 'available',
    animationTimePolicy: resolveAnimationTimePolicy(
      isRecord(candidate.animationTimePolicy)
        ? (candidate.animationTimePolicy as Partial<SessionState['animationTimePolicy']>)
        : undefined
    )
  };
};

const asTextureAssets = (value: unknown): EnginePersistedTextureAsset[] => {
  if (!Array.isArray(value)) return [];
  const out: EnginePersistedTextureAsset[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === 'string' ? entry.name : null;
    if (!name) continue;
    out.push({
      ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
      name,
      ...(typeof entry.dataUri === 'string' ? { dataUri: entry.dataUri } : {}),
      ...(typeof entry.width === 'number' && Number.isFinite(entry.width) ? { width: entry.width } : {}),
      ...(typeof entry.height === 'number' && Number.isFinite(entry.height) ? { height: entry.height } : {})
    });
  }
  return out;
};

const asTextureUsage = (value: unknown): TextureUsageResult => {
  if (!isRecord(value)) return { textures: [] };
  const textures = Array.isArray(value.textures) ? (value.textures as TextureUsageEntry[]) : [];
  const unresolved = Array.isArray(value.unresolved)
    ? (value.unresolved as TextureUsageResult['unresolved'])
    : undefined;
  return {
    textures,
    ...(unresolved && unresolved.length > 0 ? { unresolved } : {})
  };
};

export const loadPersistedState = (record: PersistedProjectRecord | null): LoadedPersistedState => {
  if (!record) {
    return {
      session: new ProjectSession().snapshot(),
      textureResolution: { ...DEFAULT_TEXTURE_RESOLUTION },
      textureUsage: { textures: [] },
      textureAssets: []
    };
  }
  const state = record.state;
  if (isRecord(state) && isRecord(state.session)) {
    const envelope = state as EnginePersistedStateEnvelope;
    return {
      session: asSessionState(envelope.session),
      textureResolution: asTextureResolution(envelope.textureResolution) ?? { ...DEFAULT_TEXTURE_RESOLUTION },
      textureUsage: asTextureUsage(envelope.textureUsage),
      textureAssets: asTextureAssets(envelope.textureAssets)
    };
  }
  return {
    session: asSessionState(state),
    textureResolution: { ...DEFAULT_TEXTURE_RESOLUTION },
    textureUsage: { textures: [] },
    textureAssets: []
  };
};

export const toPersistenceEnvelope = (
  session: SessionState,
  stateReader: EnginePersistenceStateReader
): EnginePersistedStateEnvelope => {
  const persisted = stateReader.exportPersistenceState();
  return {
    version: ENGINE_STATE_VERSION,
    session,
    textureResolution: persisted.textureResolution,
    textureUsage: cloneTextureUsage(persisted.textureUsage),
    textureAssets: persisted.textureAssets.map((asset) => ({ ...asset }))
  };
};
