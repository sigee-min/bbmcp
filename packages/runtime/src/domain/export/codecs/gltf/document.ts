import type { Vec3, Vec4 } from './primitives';

export type BuiltSampler = {
  inputTimes: number[];
  outputValues: number[]; // packed floats
  outputType: 'VEC3' | 'VEC4';
  interpolation: 'STEP' | 'LINEAR';
  nodeIndex: number;
  path: 'translation' | 'rotation' | 'scale';
};

export type GltfNode = {
  name: string;
  translation?: Vec3;
  rotation?: Vec4;
  scale?: Vec3;
  children?: number[];
  mesh?: number;
  skin?: number;
};

export type GltfAnimationSampler = {
  input: number;
  output: number;
  interpolation: BuiltSampler['interpolation'];
};

export type GltfAnimationChannel = {
  sampler: number;
  target: {
    node: number;
    path: BuiltSampler['path'];
  };
};

export type GltfAnimation = {
  name: string;
  samplers: GltfAnimationSampler[];
  channels: GltfAnimationChannel[];
  extras: {
    ashfox: {
      loop: boolean;
      length: number;
      fps?: number;
    };
  };
};

export type GltfBufferView = {
  buffer: number;
  byteOffset: number;
  byteLength: number;
};

export type GltfAccessor = {
  bufferView: number;
  componentType: 5123 | 5126;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
};

export type GltfMaterial = {
  pbrMetallicRoughness:
    | {
        baseColorTexture: { index: number };
        metallicFactor: number;
        roughnessFactor: number;
      }
    | {
        baseColorFactor: [number, number, number, number];
        metallicFactor: number;
        roughnessFactor: number;
      };
  doubleSided: true;
};

export type GltfDocument = {
  asset: { version: string; generator: string };
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: GltfNode[];
  meshes: Array<{
    primitives: Array<{
      attributes: {
        POSITION: number;
        NORMAL: number;
        TEXCOORD_0: number;
        JOINTS_0: number;
        WEIGHTS_0: number;
      };
      mode: number;
      material: number;
    }>;
  }>;
  skins: Array<{
    joints: number[];
    skeleton: number;
    inverseBindMatrices: number;
  }>;
  buffers: Array<{ byteLength: number; uri: string }>;
  bufferViews: GltfBufferView[];
  accessors: GltfAccessor[];
  materials: GltfMaterial[];
  animations: GltfAnimation[];
  samplers?: Array<{ magFilter: number; minFilter: number; wrapS: number; wrapT: number }>;
  images?: Array<{ uri: string }>;
  textures?: Array<{ sampler: number; source: number }>;
};
