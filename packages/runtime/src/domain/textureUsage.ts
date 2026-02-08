import { CUBE_FACE_DIRECTIONS } from './model';
import { hashTextToHex } from '../shared/hash';
import type { CubeFaceDirection, TextureUsage } from './model';

type NormalizedFace = { face: CubeFaceDirection; uv: [number, number, number, number] | null };
type NormalizedCube = { id: string | null; name: string; faces: NormalizedFace[] };
type NormalizedTexture = {
  id: string | null;
  name: string;
  width: number | null;
  height: number | null;
  cubes: NormalizedCube[];
};
type NormalizedUsage = {
  textures: NormalizedTexture[];
  projectResolution?: { width: number; height: number };
};

const FACE_ORDER: CubeFaceDirection[] = [...CUBE_FACE_DIRECTIONS];
const FACE_INDEX = new Map<CubeFaceDirection, number>(FACE_ORDER.map((face, idx) => [face, idx]));

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const sortKey = (name: string, id?: string | null) => `${name}|${id ?? ''}`;

const normalizeFaces = (faces: NormalizedFace[]): NormalizedFace[] =>
  faces
    .slice()
    .sort((a, b) => (FACE_INDEX.get(a.face) ?? 0) - (FACE_INDEX.get(b.face) ?? 0));

const normalizeUsage = (
  usage: TextureUsage,
  projectResolution?: { width: number; height: number } | null
): NormalizedUsage => {
  const textures = usage.textures
    .map((texture) => {
      const width = normalizeTextureSize(texture.width);
      const height = normalizeTextureSize(texture.height);
      const cubes = texture.cubes
        .map((cube) => {
          const faces = normalizeFaces(
            cube.faces.map((face) => ({
              face: face.face,
              uv: face.uv ? [...face.uv] : null
            }))
          );
          return { id: cube.id ?? null, name: cube.name, faces };
        })
        .sort((a, b) => compareStrings(sortKey(a.name, a.id), sortKey(b.name, b.id)));
      return { id: texture.id ?? null, name: texture.name, width, height, cubes };
    })
    .sort((a, b) => compareStrings(sortKey(a.name, a.id), sortKey(b.name, b.id)));
  const includeProjectResolution = textures.some((texture) => !texture.width || !texture.height);
  const normalizedResolution = includeProjectResolution ? normalizeResolution(projectResolution) : null;
  return normalizedResolution ? { textures, projectResolution: normalizedResolution } : { textures };
};

export const computeTextureUsageId = (
  usage: TextureUsage,
  projectResolution?: { width: number; height: number } | null
): string => hashTextToHex(JSON.stringify(normalizeUsage(usage, projectResolution)));

const normalizeTextureSize = (value?: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
};

const normalizeResolution = (
  resolution?: { width: number; height: number } | null
): { width: number; height: number } | null => {
  if (!resolution) return null;
  const width = normalizeTextureSize(resolution.width);
  const height = normalizeTextureSize(resolution.height);
  if (!width || !height) return null;
  return { width, height };
};


