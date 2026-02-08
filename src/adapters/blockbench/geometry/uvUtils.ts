import { CUBE_FACE_DIRECTIONS } from '../../../shared/toolConstants';
import type { CubeFace, CubeFaceDirection, CubeInstance, TextureInstance } from '../../../types/blockbench';

export const VALID_FACE_KEYS = new Set<CubeFaceDirection>(CUBE_FACE_DIRECTIONS);
export const ALL_FACES: CubeFaceDirection[] = [...CUBE_FACE_DIRECTIONS];

export const resolveFaceTextureRef = (texture: TextureInstance | null | undefined): string | null => {
  if (!texture) return null;
  const raw = texture.uuid ?? texture.id ?? texture.ashfoxId ?? texture.name ?? null;
  return raw ? String(raw) : null;
};

export const ensureFaceMap = (cube: CubeInstance): Record<string, CubeFace> => {
  if (!cube.faces || typeof cube.faces !== 'object') {
    cube.faces = {};
  }
  return cube.faces as Record<string, CubeFace>;
};

export const ensureFaceEntry = (faceMap: Record<string, CubeFace>, face: CubeFaceDirection): CubeFace => {
  const existing = faceMap[face];
  if (existing) return existing;
  const created: CubeFace = {};
  faceMap[face] = created;
  return created;
};

export const normalizeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | undefined => {
  if (!faces || faces.length === 0) return undefined;
  const valid = new Set<CubeFaceDirection>();
  faces.forEach((face) => {
    if (face) valid.add(face);
  });
  return valid.size > 0 ? Array.from(valid) : undefined;
};

export const enforceManualUvMode = (cube: CubeInstance, options?: { preserve?: boolean }): void => {
  if (options?.preserve) {
    const usesAutoUv =
      Boolean(cube.box_uv) || (typeof cube.autouv === 'number' && cube.autouv > 0);
    if (usesAutoUv && typeof cube.mapAutoUV === 'function') {
      cube.mapAutoUV();
    }
  }
  if (typeof cube.setUVMode === 'function') {
    cube.setUVMode(false);
  } else if (typeof cube.box_uv === 'boolean') {
    cube.box_uv = false;
  }
  if (typeof cube.autouv === 'number') {
    cube.autouv = 0;
  }
};

