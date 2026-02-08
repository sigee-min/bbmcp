import type { CubeFaceDirection } from './shared';

export type TextureUsageCube = {
  id?: string;
  name: string;
  faces: Array<{ face: CubeFaceDirection; uv?: [number, number, number, number] }>;
};

export type TextureUsageEntry = {
  id?: string;
  name: string;
  width?: number;
  height?: number;
  cubeCount: number;
  faceCount: number;
  cubes: TextureUsageCube[];
};

export type TextureUsageUnresolved = {
  textureRef: string;
  cubeId?: string;
  cubeName: string;
  face: CubeFaceDirection;
};

export type TextureUsageResult = {
  textures: TextureUsageEntry[];
  unresolved?: TextureUsageUnresolved[];
};

export type TextureUsageQuery = {
  textureId?: string;
  textureName?: string;
};
