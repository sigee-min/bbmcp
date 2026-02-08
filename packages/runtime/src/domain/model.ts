import { CUBE_FACE_DIRECTIONS } from '../shared/toolConstants';

export type CubeFaceDirection = typeof CUBE_FACE_DIRECTIONS[number];
export { CUBE_FACE_DIRECTIONS };

export type FaceUvRect = [number, number, number, number];

export type FaceUvMap = Partial<Record<CubeFaceDirection, FaceUvRect>>;

export type TextureUsageFace = {
  face: CubeFaceDirection;
  uv?: FaceUvRect;
};

export type TextureUsageCube = {
  id?: string;
  name: string;
  faces: TextureUsageFace[];
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

export type TextureUsage = {
  textures: TextureUsageEntry[];
  unresolved?: TextureUsageUnresolved[];
};

export type Cube = {
  id?: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  bone: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  uv?: [number, number];
  uvOffset?: [number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
};

export type Bone = {
  id?: string;
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
};

export type Animation = {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps?: number;
};

export type MeshVertex = {
  id: string;
  pos: [number, number, number];
};

export type MeshFaceUv = {
  vertexId: string;
  uv: [number, number];
};

export type MeshFace = {
  id?: string;
  vertices: string[];
  uv?: MeshFaceUv[];
  texture?: string | false;
};

export type Mesh = {
  id?: string;
  name: string;
  bone?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  visibility?: boolean;
  vertices: MeshVertex[];
  faces: MeshFace[];
};

export type Snapshot = {
  bones: Bone[];
  cubes: Cube[];
  meshes: Mesh[];
  animations: Animation[];
};

export type TextureStat = {
  id?: string | null;
  name: string;
  width: number;
  height: number;
  path?: string;
};

export type TextureResolution = {
  width: number;
  height: number;
};

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationFinding = {
  code: string;
  message: string;
  severity: ValidationSeverity;
};

export type Limits = {
  maxCubes: number;
  maxTextureSize: number;
  maxAnimationSeconds: number;
};


