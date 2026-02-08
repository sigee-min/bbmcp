import type { ToolError } from '@ashfox/contracts/types/internal';
import type { TextureUsageQuery, TextureUsageResult, TextureUsageUnresolved } from '../../ports/editor';
import type { CubeFaceDirection, CubeInstance, TextureInstance } from '../../types/blockbench';
import { CUBE_FACE_DIRECTIONS } from '../../shared/toolConstants';
import { readNodeId, readTextureAliases, readTextureId } from './blockbenchUtils';
import { TEXTURE_NOT_FOUND } from '../../shared/messages';

const VALID_FACE_KEYS = new Set<CubeFaceDirection>(CUBE_FACE_DIRECTIONS);

type TextureUsageDeps = {
  cubes: CubeInstance[];
  textures: TextureInstance[];
};

type TextureMeta = {
  id?: string;
  name: string;
  width?: number;
  height?: number;
};

type UsageFace = {
  face: CubeFaceDirection;
  uv?: [number, number, number, number];
};

type UsageCube = {
  id?: string;
  name: string;
  faces: Map<CubeFaceDirection, UsageFace>;
};

type UsageEntry = {
  id?: string;
  name: string;
  width?: number;
  height?: number;
  cubes: Map<string, UsageCube>;
  faceCount: number;
};

type TextureIndex = {
  byId: Map<string, string>;
  byName: Map<string, string>;
  metaByKey: Map<string, TextureMeta>;
};

export const buildTextureUsageResult = (
  params: TextureUsageQuery,
  deps: TextureUsageDeps
): { result?: TextureUsageResult; error?: ToolError } => {
  const textureIndex = buildTextureIndex(Array.isArray(deps.textures) ? deps.textures : []);
  const targetKeysRes = resolveTargetTextureKeys(params, textureIndex);
  if (targetKeysRes.error) return { error: targetKeysRes.error };

  const usageMap = createUsageEntryMap(targetKeysRes.result, textureIndex.metaByKey);
  const unresolved = collectTextureUsage(deps.cubes, targetKeysRes.result, textureIndex, usageMap);
  return {
    result: serializeTextureUsageResult(usageMap, unresolved)
  };
};

const buildTextureIndex = (textures: TextureInstance[]): TextureIndex => {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  const metaByKey = new Map<string, TextureMeta>();
  textures.forEach((tex) => {
    const id = readTextureId(tex) ?? undefined;
    const name = tex?.name ?? tex?.id ?? 'texture';
    const key = id ? `id:${id}` : `name:${name}`;
    const width = normalizeTextureSize(tex?.width);
    const height = normalizeTextureSize(tex?.height);
    metaByKey.set(key, {
      id,
      name,
      ...(width ? { width } : {}),
      ...(height ? { height } : {})
    });
    const aliases = readTextureAliases(tex);
    aliases.forEach((alias) => {
      if (!byId.has(alias)) byId.set(alias, key);
    });
    if (name) byName.set(name, key);
  });
  return { byId, byName, metaByKey };
};

const resolveTargetTextureKeys = (
  params: TextureUsageQuery,
  index: TextureIndex
): { result: Set<string>; error?: ToolError } => {
  const targetKeys = new Set<string>(index.metaByKey.keys());
  if (!params.textureId && !params.textureName) {
    return { result: targetKeys };
  }
  const label = params.textureId ?? params.textureName ?? 'unknown';
  const match =
    (params.textureId && index.byId.get(params.textureId)) ||
    (params.textureName && index.byName.get(params.textureName)) ||
    null;
  if (!match) {
    return { result: targetKeys, error: { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) } };
  }
  targetKeys.clear();
  targetKeys.add(match);
  return { result: targetKeys };
};

const createUsageEntryMap = (
  targetKeys: Set<string>,
  metaByKey: Map<string, TextureMeta>
): Map<string, UsageEntry> => {
  const usageMap = new Map<string, UsageEntry>();
  targetKeys.forEach((key) => {
    const meta = metaByKey.get(key);
    if (!meta) return;
    usageMap.set(key, {
      id: meta.id,
      name: meta.name,
      ...(meta.width ? { width: meta.width } : {}),
      ...(meta.height ? { height: meta.height } : {}),
      cubes: new Map(),
      faceCount: 0
    });
  });
  return usageMap;
};

const collectTextureUsage = (
  cubes: CubeInstance[],
  targetKeys: Set<string>,
  index: TextureIndex,
  usageMap: Map<string, UsageEntry>
): TextureUsageUnresolved[] => {
  const unresolved: TextureUsageUnresolved[] = [];
  cubes.forEach((cube) => {
    const cubeId = readNodeId(cube) ?? undefined;
    const cubeName = cube?.name ? String(cube.name) : 'cube';
    const faces = cube.faces ?? {};
    Object.entries(faces).forEach(([faceKey, face]) => {
      if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection)) return;
      const ref = face?.texture;
      if (ref === false || ref === undefined || ref === null) return;
      const faceDir = faceKey as CubeFaceDirection;
      const refValue = typeof ref === 'string' ? ref : String(ref);
      const key = resolveTextureKey(refValue, index.byId, index.byName);
      if (!key) {
        unresolved.push({ textureRef: refValue, cubeId, cubeName, face: faceDir });
        return;
      }
      if (!targetKeys.has(key)) return;
      const entry = usageMap.get(key);
      if (!entry) return;
      upsertUsageCubeFace(entry, {
        cubeId,
        cubeName,
        face: faceDir,
        uv: normalizeFaceUv(face?.uv)
      });
    });
  });
  return unresolved;
};

const upsertUsageCubeFace = (
  entry: UsageEntry,
  face: { cubeId?: string; cubeName: string; face: CubeFaceDirection; uv?: [number, number, number, number] }
) => {
  const cubeKey = face.cubeId ? `id:${face.cubeId}` : `name:${face.cubeName}`;
  let cubeEntry = entry.cubes.get(cubeKey);
  if (!cubeEntry) {
    cubeEntry = { id: face.cubeId, name: face.cubeName, faces: new Map() };
    entry.cubes.set(cubeKey, cubeEntry);
  }
  const existing = cubeEntry.faces.get(face.face);
  if (!existing) {
    cubeEntry.faces.set(face.face, { face: face.face, uv: face.uv });
  } else if (!existing.uv && face.uv) {
    existing.uv = face.uv;
  }
  entry.faceCount += 1;
};

const serializeTextureUsageResult = (
  usageMap: Map<string, UsageEntry>,
  unresolved: TextureUsageUnresolved[]
): TextureUsageResult => ({
  textures: Array.from(usageMap.values()).map((entry) => ({
    id: entry.id,
    name: entry.name,
    ...(entry.width ? { width: entry.width } : {}),
    ...(entry.height ? { height: entry.height } : {}),
    cubeCount: entry.cubes.size,
    faceCount: entry.faceCount,
    cubes: Array.from(entry.cubes.values()).map((cube) => ({
      id: cube.id,
      name: cube.name,
      faces: Array.from(cube.faces.values())
    }))
  })),
  ...(unresolved.length > 0 ? { unresolved } : {})
});

const resolveTextureKey = (ref: string, byId: Map<string, string>, byName: Map<string, string>): string | null => {
  if (byId.has(ref)) return byId.get(ref) ?? null;
  if (byName.has(ref)) return byName.get(ref) ?? null;
  return null;
};

const normalizeFaceUv = (value: unknown): [number, number, number, number] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value) && value.length >= 4) {
    const [x1, y1, x2, y2] = value;
    if ([x1, y1, x2, y2].every((v) => typeof v === 'number')) {
      return [x1, y1, x2, y2];
    }
  }
  return undefined;
};

const normalizeTextureSize = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.trunc(value);
};



