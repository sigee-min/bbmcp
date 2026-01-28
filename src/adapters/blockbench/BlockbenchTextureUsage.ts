import type { ToolError } from '../../types';
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

export const buildTextureUsageResult = (
  params: TextureUsageQuery,
  deps: TextureUsageDeps
): { result?: TextureUsageResult; error?: ToolError } => {
  const textures = Array.isArray(deps.textures) ? deps.textures : [];
  const usageMap = new Map<
    string,
    {
      id?: string;
      name: string;
      cubes: Map<
        string,
        { id?: string; name: string; faces: Map<CubeFaceDirection, { face: CubeFaceDirection; uv?: [number, number, number, number] }> }
      >;
      faceCount: number;
    }
  >();
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  const metaByKey = new Map<string, { id?: string; name: string }>();
  textures.forEach((tex) => {
    const id = readTextureId(tex) ?? undefined;
    const name = tex?.name ?? tex?.id ?? 'texture';
    const key = id ? `id:${id}` : `name:${name}`;
    metaByKey.set(key, { id, name });
    const aliases = readTextureAliases(tex);
    aliases.forEach((alias) => {
      if (!byId.has(alias)) {
        byId.set(alias, key);
      }
    });
    if (name) byName.set(name, key);
  });

  const targetKeys = new Set<string>(metaByKey.keys());
  if (params.textureId || params.textureName) {
    const label = params.textureId ?? params.textureName ?? 'unknown';
    const match =
      (params.textureId && byId.get(params.textureId)) ||
      (params.textureName && byName.get(params.textureName)) ||
      null;
    if (!match) {
      return { error: { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) } };
    }
    targetKeys.clear();
    targetKeys.add(match);
  }

  targetKeys.forEach((key) => {
    const meta = metaByKey.get(key);
    if (!meta) return;
    usageMap.set(key, { id: meta.id, name: meta.name, cubes: new Map(), faceCount: 0 });
  });

  const unresolved: TextureUsageUnresolved[] = [];
  deps.cubes.forEach((cube) => {
    const cubeId = readNodeId(cube) ?? undefined;
    const cubeName = cube?.name ? String(cube.name) : 'cube';
    const faces = cube.faces ?? {};
    Object.entries(faces).forEach(([faceKey, face]) => {
      if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection)) return;
      const ref = face?.texture;
      if (ref === false || ref === undefined || ref === null) return;
      const refValue = typeof ref === 'string' ? ref : String(ref);
      const key = resolveTextureKey(refValue, byId, byName);
      if (!key) {
        unresolved.push({ textureRef: refValue, cubeId, cubeName, face: faceKey as CubeFaceDirection });
        return;
      }
      if (!targetKeys.has(key)) return;
      const entry = usageMap.get(key);
      if (!entry) return;
      const cubeKey = cubeId ? `id:${cubeId}` : `name:${cubeName}`;
      let cubeEntry = entry.cubes.get(cubeKey);
      if (!cubeEntry) {
        cubeEntry = { id: cubeId, name: cubeName, faces: new Map() };
        entry.cubes.set(cubeKey, cubeEntry);
      }
      const faceDir = faceKey as CubeFaceDirection;
      if (!cubeEntry.faces.has(faceDir)) {
        cubeEntry.faces.set(faceDir, { face: faceDir, uv: normalizeFaceUv(face?.uv) });
      } else {
        const existing = cubeEntry.faces.get(faceDir);
        if (existing && !existing.uv) {
          existing.uv = normalizeFaceUv(face?.uv);
        }
      }
      entry.faceCount += 1;
    });
  });

  const texturesResult = Array.from(usageMap.values()).map((entry) => ({
    id: entry.id,
    name: entry.name,
    cubeCount: entry.cubes.size,
    faceCount: entry.faceCount,
    cubes: Array.from(entry.cubes.values()).map((cube) => ({
      id: cube.id,
      name: cube.name,
      faces: Array.from(cube.faces.values())
    }))
  }));
  const result: TextureUsageResult = {
    textures: texturesResult,
    ...(unresolved.length > 0 ? { unresolved } : {})
  };
  return { result };
};

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
