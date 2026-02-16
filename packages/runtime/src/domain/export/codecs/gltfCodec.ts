import type { CanonicalChannelKey, CanonicalExportModel, CodecEncodeResult, ExportCodecStrategy } from './types';

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

const sanitizeNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (Object.is(numeric, -0)) return 0;
  return numeric;
};

const isZeroVec3 = (value: Vec3 | undefined): boolean => {
  if (!value) return true;
  return sanitizeNumber(value[0]) === 0 && sanitizeNumber(value[1]) === 0 && sanitizeNumber(value[2]) === 0;
};

const vec3Sub = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] - b[0]),
  sanitizeNumber(a[1] - b[1]),
  sanitizeNumber(a[2] - b[2])
];

const vec3Add = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] + b[0]),
  sanitizeNumber(a[1] + b[1]),
  sanitizeNumber(a[2] + b[2])
];

const vec3Mul = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] * b[0]),
  sanitizeNumber(a[1] * b[1]),
  sanitizeNumber(a[2] * b[2])
];

const vec3Cross = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[1] * b[2] - a[2] * b[1]),
  sanitizeNumber(a[2] * b[0] - a[0] * b[2]),
  sanitizeNumber(a[0] * b[1] - a[1] * b[0])
];

const vec3Length = (v: Vec3): number =>
  Math.sqrt(sanitizeNumber(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]));

const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 1];
  return [sanitizeNumber(v[0] / len), sanitizeNumber(v[1] / len), sanitizeNumber(v[2] / len)];
};

const degToRad = (deg: number): number => sanitizeNumber(deg) * (Math.PI / 180);

const quatNormalize = (q: Vec4): Vec4 => {
  const x = sanitizeNumber(q[0]);
  const y = sanitizeNumber(q[1]);
  const z = sanitizeNumber(q[2]);
  const w = sanitizeNumber(q[3]);
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0, 1];
  return [x / len, y / len, z / len, w / len];
};

// Hamilton product q ⊗ p (both [x,y,z,w]).
const quatMul = (q: Vec4, p: Vec4): Vec4 => {
  const x = sanitizeNumber(q[0]);
  const y = sanitizeNumber(q[1]);
  const z = sanitizeNumber(q[2]);
  const w = sanitizeNumber(q[3]);
  const x2 = sanitizeNumber(p[0]);
  const y2 = sanitizeNumber(p[1]);
  const z2 = sanitizeNumber(p[2]);
  const w2 = sanitizeNumber(p[3]);
  return [
    w * x2 + x * w2 + y * z2 - z * y2,
    w * y2 - x * z2 + y * w2 + z * x2,
    w * z2 + x * y2 - y * x2 + z * w2,
    w * w2 - x * x2 - y * y2 - z * z2
  ];
};

const quatFromEulerDegXYZ = (deg: Vec3): Vec4 => {
  const x = degToRad(deg[0]);
  const y = degToRad(deg[1]);
  const z = degToRad(deg[2]);
  const hx = x / 2;
  const hy = y / 2;
  const hz = z / 2;

  const qx: Vec4 = [Math.sin(hx), 0, 0, Math.cos(hx)];
  const qy: Vec4 = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qz: Vec4 = [0, 0, Math.sin(hz), Math.cos(hz)];

  return quatNormalize(quatMul(quatMul(qz, qy), qx));
};

const rotateVec3ByQuat = (qRaw: Vec4, v: Vec3): Vec3 => {
  const q = quatNormalize(qRaw);
  const x = sanitizeNumber(q[0]);
  const y = sanitizeNumber(q[1]);
  const z = sanitizeNumber(q[2]);
  const w = sanitizeNumber(q[3]);
  const vx = sanitizeNumber(v[0]);
  const vy = sanitizeNumber(v[1]);
  const vz = sanitizeNumber(v[2]);

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);

  // v' = v + w*t + cross(q.xyz, t)
  const cx = y * tz - z * ty;
  const cy = z * tx - x * tz;
  const cz = x * ty - y * tx;

  return [vx + w * tx + cx, vy + w * ty + cy, vz + w * tz + cz];
};

const mat4Identity = (): Mat4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out: number[] = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out.map((v) => sanitizeNumber(v)) as Mat4;
};

const mat4FromTranslation = (t: Vec3): Mat4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  sanitizeNumber(t[0]), sanitizeNumber(t[1]), sanitizeNumber(t[2]), 1
];

const mat4FromScale = (s: Vec3): Mat4 => [
  sanitizeNumber(s[0]), 0, 0, 0,
  0, sanitizeNumber(s[1]), 0, 0,
  0, 0, sanitizeNumber(s[2]), 0,
  0, 0, 0, 1
];

const mat4FromQuat = (q: Vec4): Mat4 => {
  const [x, y, z, w] = quatNormalize(q);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  // Column-major (OpenGL) layout.
  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1
  ].map((v) => sanitizeNumber(v)) as Mat4;
};

const mat4Invert = (m: Mat4): Mat4 => {
  const a00 = m[0];
  const a01 = m[1];
  const a02 = m[2];
  const a03 = m[3];
  const a10 = m[4];
  const a11 = m[5];
  const a12 = m[6];
  const a13 = m[7];
  const a20 = m[8];
  const a21 = m[9];
  const a22 = m[10];
  const a23 = m[11];
  const a30 = m[12];
  const a31 = m[13];
  const a32 = m[14];
  const a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det =
    b00 * b11 -
    b01 * b10 +
    b02 * b09 +
    b03 * b08 -
    b04 * b07 +
    b05 * b06;

  if (!Number.isFinite(det) || det === 0) return mat4Identity();
  const invDet = 1 / det;

  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
    (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
    (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
    (a22 * b04 - a21 * b05 - a23 * b03) * invDet,

    (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
    (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
    (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
    (a20 * b05 - a22 * b02 + a23 * b01) * invDet,

    (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
    (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
    (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
    (a21 * b02 - a20 * b04 - a23 * b00) * invDet,

    (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
    (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
    (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
    (a20 * b03 - a21 * b01 + a22 * b00) * invDet
  ].map((v) => sanitizeNumber(v)) as Mat4;
};

const mat4FromTrs = (t: Vec3, r: Vec4, s: Vec3): Mat4 =>
  mat4Multiply(mat4Multiply(mat4FromTranslation(t), mat4FromQuat(r)), mat4FromScale(s));

type BuiltSampler = {
  inputTimes: number[];
  outputValues: number[]; // packed floats
  outputType: 'VEC3' | 'VEC4';
  interpolation: 'STEP' | 'LINEAR';
  nodeIndex: number;
  path: 'translation' | 'rotation' | 'scale';
};

type GltfNode = {
  name: string;
  translation?: Vec3;
  rotation?: Vec4;
  scale?: Vec3;
  children?: number[];
  mesh?: number;
  skin?: number;
};

type GltfAnimationSampler = {
  input: number;
  output: number;
  interpolation: BuiltSampler['interpolation'];
};

type GltfAnimationChannel = {
  sampler: number;
  target: {
    node: number;
    path: BuiltSampler['path'];
  };
};

type GltfAnimation = {
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

type GltfBufferView = {
  buffer: number;
  byteOffset: number;
  byteLength: number;
};

type GltfAccessor = {
  bufferView: number;
  componentType: 5123 | 5126;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
};

type GltfMaterial = {
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

type GltfDocument = {
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

const channelOrder = (channel: 'pos' | 'rot' | 'scale'): number => {
  if (channel === 'pos') return 0;
  if (channel === 'rot') return 1;
  return 2;
};

const normalizeTimeEpsilon = (value: unknown): number => {
  const eps = sanitizeNumber(value);
  return eps === 0 ? 1e-9 : eps;
};

const quantizeTime = (t: unknown, epsilon: number): number => {
  const time = sanitizeNumber(t);
  const factor = 1 / epsilon;
  return Math.round(time * factor) / factor;
};

const timeBucket = (t: number, epsilon: number): number => Math.round(quantizeTime(t, epsilon) / epsilon);

type DecodedChannelKey = CanonicalChannelKey & { bucket: number; timeN: number };

const decodeTrackKeys = (keys: CanonicalChannelKey[], epsilon: number): DecodedChannelKey[] => {
  const buckets = new Map<number, DecodedChannelKey>();
  for (const key of keys) {
    const timeN = quantizeTime(key.time, epsilon);
    const bucket = timeBucket(key.time, epsilon);
    // Same bucket => last key wins.
    buckets.set(bucket, { ...key, bucket, timeN } as DecodedChannelKey);
  }
  return [...buckets.values()].sort((a, b) => a.bucket - b.bucket);
};

const pickInterpolation = (
  keys: Array<{ interp?: 'linear' | 'step' | 'catmullrom' }>,
  warnings: Set<string>
): 'STEP' | 'LINEAR' => {
  const set = new Set<'linear' | 'step' | 'catmullrom'>();
  let hasCatmull = false;
  for (const key of keys) {
    const interp = key.interp ?? 'linear';
    if (interp === 'catmullrom') hasCatmull = true;
    set.add(interp);
  }
  if (set.size > 1) warnings.add('GLT-WARN-MIXED_INTERP');
  if (hasCatmull) warnings.add('GLT-WARN-INTERP_DEGRADED');
  if (set.size === 1 && set.has('step')) return 'STEP';
  return 'LINEAR';
};

class ByteWriter {
  private readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  align4(): void {
    while (this.bytes.length % 4 !== 0) this.bytes.push(0);
  }

  append(data: Uint8Array): void {
    for (const byte of data) this.bytes.push(byte);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const packFloat32 = (values: number[]): Uint8Array => {
  const buf = new ArrayBuffer(values.length * 4);
  const view = new DataView(buf);
  values.forEach((value, idx) => {
    view.setFloat32(idx * 4, sanitizeNumber(value), true);
  });
  return new Uint8Array(buf);
};

const packUint16 = (values: number[]): Uint8Array => {
  const buf = new ArrayBuffer(values.length * 2);
  const view = new DataView(buf);
  values.forEach((value, idx) => {
    view.setUint16(idx * 2, Math.max(0, Math.min(65535, Math.floor(sanitizeNumber(value)))), true);
  });
  return new Uint8Array(buf);
};

const encodeDataUri = (mime: string, bytes: Uint8Array): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

export class GltfCodec implements ExportCodecStrategy {
  readonly format = 'gltf' as const;

  encode(model: CanonicalExportModel): CodecEncodeResult {
    const warnings = new Set<string>();

    const bonesIn = model.bones ?? [];
    const bones: CanonicalExportModel['bones'] = bonesIn.length === 0
      ? [{ name: 'root', pivot: [0, 0, 0], cubes: [] }]
      : bonesIn;

    const boneIndexByName = new Map<string, number>();
    bones.forEach((bone, idx) => {
      boneIndexByName.set(bone.name, idx);
    });

    const parentIndex: number[] = bones.map((bone) => {
      if (!bone.parent) return -1;
      const parentIdx = boneIndexByName.get(bone.parent);
      return parentIdx === undefined ? -1 : parentIdx;
    });

    const firstRootIdx = parentIndex.findIndex((idx) => idx === -1);
    const rootBoneIndex = boneIndexByName.get('root') ?? (firstRootIdx >= 0 ? firstRootIdx : 0);

    const boneLocalTranslation = (idx: number): Vec3 => {
      const b = bones[idx]!;
      const pivot = b.pivot as Vec3;
      const pIdx = parentIndex[idx] ?? -1;
      if (pIdx < 0) return [sanitizeNumber(pivot[0]), sanitizeNumber(pivot[1]), sanitizeNumber(pivot[2])];
      const parentPivot = (bones[pIdx]!.pivot ?? [0, 0, 0]) as Vec3;
      return vec3Sub(pivot, parentPivot);
    };

    const boneBaseRotationQuat = (idx: number): Vec4 => {
      const b = bones[idx]!;
      const rot = (b.rotation ?? [0, 0, 0]) as Vec3;
      return quatFromEulerDegXYZ(rot);
    };

    const boneBaseScale = (idx: number): Vec3 => {
      const b = bones[idx]!;
      return (b.scale ?? [1, 1, 1]) as Vec3;
    };

    const childrenByIndex: number[][] = bones.map(() => []);
    bones.forEach((bone, idx) => {
      const p = bone.parent ? boneIndexByName.get(bone.parent) : undefined;
      if (p === undefined) return;
      childrenByIndex[p]!.push(idx);
    });

    const nodes: GltfNode[] = bones.map((bone, idx) => ({
      name: bone.name,
      translation: boneLocalTranslation(idx),
      rotation: boneBaseRotationQuat(idx),
      scale: boneBaseScale(idx),
      children: childrenByIndex[idx]!
    }));

    const meshNodeIndex = bones.length;
    nodes.push({
      name: model.name,
      mesh: 0,
      skin: 0
    });

    const rootNodes: number[] = [];
    bones.forEach((_, idx) => {
      if (parentIndex[idx] === -1) rootNodes.push(idx);
    });
    if (rootNodes.length === 0) rootNodes.push(0);
    rootNodes.push(meshNodeIndex);

    const skeletonIndex =
      boneIndexByName.get('root') ??
      rootNodes.find((idx) => idx !== meshNodeIndex) ??
      0;

    // Geometry streams (non-indexed triangle list).
    const positions: number[] = [];
    const normals: number[] = [];
    const texcoords: number[] = [];
    const joints: number[] = [];
    const weights: number[] = [];

    const tw = sanitizeNumber(model.texture.width) || 1;
    const th = sanitizeNumber(model.texture.height) || 1;

    const pushVertex = (pos: Vec3, normal: Vec3, uv: Vec2, jointIndex: number): void => {
      positions.push(sanitizeNumber(pos[0]), sanitizeNumber(pos[1]), sanitizeNumber(pos[2]));
      normals.push(sanitizeNumber(normal[0]), sanitizeNumber(normal[1]), sanitizeNumber(normal[2]));
      texcoords.push(sanitizeNumber(uv[0]), sanitizeNumber(uv[1]));
      joints.push(jointIndex, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    };

    const pushTriangle = (
      verts: [Vec3, Vec3, Vec3],
      normal: Vec3,
      uvs: [Vec2, Vec2, Vec2],
      jointIndex: number
    ): void => {
      pushVertex(verts[0], normal, uvs[0], jointIndex);
      pushVertex(verts[1], normal, uvs[1], jointIndex);
      pushVertex(verts[2], normal, uvs[2], jointIndex);
    };

    const appendCube = (cube: CanonicalExportModel['cubes'][number]) => {
      const boneIdx = boneIndexByName.get(cube.bone);
      const jointIndex = boneIdx === undefined ? rootBoneIndex : boneIdx;
      if (boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

      let x0 = sanitizeNumber(cube.from[0]);
      let y0 = sanitizeNumber(cube.from[1]);
      let z0 = sanitizeNumber(cube.from[2]);
      let x1 = sanitizeNumber(cube.to[0]);
      let y1 = sanitizeNumber(cube.to[1]);
      let z1 = sanitizeNumber(cube.to[2]);

      const inflate = cube.inflate !== undefined ? sanitizeNumber(cube.inflate) : 0;
      if (inflate !== 0) {
        x0 -= inflate;
        y0 -= inflate;
        z0 -= inflate;
        x1 += inflate;
        y1 += inflate;
        z1 += inflate;
      }

      const sx = sanitizeNumber(x1 - x0);
      const sy = sanitizeNumber(y1 - y0);
      const sz = sanitizeNumber(z1 - z0);

      const uvBase = (cube.uvOffset ?? cube.uv ?? [0, 0]) as Vec2;
      const uvProvided = cube.uvOffset !== undefined || cube.uv !== undefined;
      if (!uvProvided) warnings.add('GLT-WARN-CUBE_UV_MISSING');
      const u = sanitizeNumber(uvBase[0]);
      const v = sanitizeNumber(uvBase[1]);

      const u0 = u;
      const u1 = u0 + sz;
      const u2 = u1 + sx;
      const u3 = u2 + sz;
      // const u4 = u3 + sx; // unused in v1 mapping
      const v0 = v;
      const v1 = v0 + sz;
      // const v2 = v1 + sy; // unused in v1 mapping

      const rects = {
        up: { u0: u1, v0, w: sx, h: sz },
        down: { u0: u2, v0, w: sx, h: sz },
        west: { u0: u0, v0: v1, w: sz, h: sy },
        north: { u0: u1, v0: v1, w: sx, h: sy },
        east: { u0: u2, v0: v1, w: sz, h: sy },
        south: { u0: u3, v0: v1, w: sx, h: sy }
      } as const;

      const mirror = cube.mirror === true;
      const rectUv = (r: { u0: number; v0: number; w: number; h: number }) => {
        let uMin = r.u0 / tw;
        let uMax = (r.u0 + r.w) / tw;
        const vMin = r.v0 / th;
        const vMax = (r.v0 + r.h) / th;
        if (mirror) {
          const tmp = uMin;
          uMin = uMax;
          uMax = tmp;
        }
        return { uMin, uMax, vMin, vMax };
      };

      const hasRotation = cube.rotation !== undefined && !isZeroVec3(cube.rotation as Vec3);
      const qRot = hasRotation ? quatFromEulerDegXYZ(cube.rotation as Vec3) : ([0, 0, 0, 1] as Vec4);
      const pivot: Vec3 = hasRotation
        ? (cube.origin
            ? (cube.origin as Vec3)
            : ([sanitizeNumber((x0 + x1) / 2), sanitizeNumber((y0 + y1) / 2), sanitizeNumber((z0 + z1) / 2)] as Vec3))
        : ([0, 0, 0] as Vec3);
      if (hasRotation && !cube.origin) warnings.add('GLT-WARN-CUBE_PIVOT_DEFAULTED');

      const rotatePos = (p: Vec3): Vec3 => {
        if (!hasRotation) return p;
        const relative = vec3Sub(p, pivot);
        const rotated = rotateVec3ByQuat(qRot, relative);
        return vec3Add(pivot, rotated);
      };
      const rotateNormal = (n: Vec3): Vec3 => (hasRotation ? vec3Normalize(rotateVec3ByQuat(qRot, n)) : n);

      const faces = [
        {
          id: 'north',
          normal: rotateNormal([0, 0, -1]),
          verts: [
            rotatePos([x0, y0, z0]),
            rotatePos([x0, y1, z0]),
            rotatePos([x1, y1, z0]),
            rotatePos([x1, y0, z0])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.north),
          map: 'north'
        },
        {
          id: 'south',
          normal: rotateNormal([0, 0, 1]),
          verts: [
            rotatePos([x1, y0, z1]),
            rotatePos([x1, y1, z1]),
            rotatePos([x0, y1, z1]),
            rotatePos([x0, y0, z1])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.south),
          map: 'south'
        },
        {
          id: 'east',
          normal: rotateNormal([1, 0, 0]),
          verts: [
            rotatePos([x1, y0, z0]),
            rotatePos([x1, y1, z0]),
            rotatePos([x1, y1, z1]),
            rotatePos([x1, y0, z1])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.east),
          map: 'east'
        },
        {
          id: 'west',
          normal: rotateNormal([-1, 0, 0]),
          verts: [
            rotatePos([x0, y0, z1]),
            rotatePos([x0, y1, z1]),
            rotatePos([x0, y1, z0]),
            rotatePos([x0, y0, z0])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.west),
          map: 'west'
        },
        {
          id: 'up',
          normal: rotateNormal([0, 1, 0]),
          verts: [
            rotatePos([x0, y1, z0]),
            rotatePos([x0, y1, z1]),
            rotatePos([x1, y1, z1]),
            rotatePos([x1, y1, z0])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.up),
          map: 'up'
        },
        {
          id: 'down',
          normal: rotateNormal([0, -1, 0]),
          verts: [
            rotatePos([x0, y0, z1]),
            rotatePos([x0, y0, z0]),
            rotatePos([x1, y0, z0]),
            rotatePos([x1, y0, z1])
          ] as [Vec3, Vec3, Vec3, Vec3],
          uv: rectUv(rects.down),
          map: 'down'
        }
      ] as const;

      for (const face of faces) {
        const { uMin, uMax, vMin, vMax } = face.uv;
        const v0uv: Vec2 = (() => {
          if (face.map === 'up' || face.map === 'down') return [uMin, vMin];
          if (face.map === 'north' || face.map === 'south') return [uMin, vMax];
          return [uMax, vMax];
        })();
        const v1uv: Vec2 = (() => {
          if (face.map === 'up' || face.map === 'down') return [uMin, vMax];
          if (face.map === 'north' || face.map === 'south') return [uMin, vMin];
          return [uMax, vMin];
        })();
        const v2uv: Vec2 = (() => {
          if (face.map === 'up' || face.map === 'down') return [uMax, vMax];
          if (face.map === 'north' || face.map === 'south') return [uMax, vMin];
          return [uMin, vMin];
        })();
        const v3uv: Vec2 = (() => {
          if (face.map === 'up' || face.map === 'down') return [uMax, vMin];
          if (face.map === 'north' || face.map === 'south') return [uMax, vMax];
          return [uMin, vMax];
        })();

        const v0 = face.verts[0];
        const v1 = face.verts[1];
        const v2 = face.verts[2];
        const v3 = face.verts[3];
        const normal = face.normal;

        // (0,1,2), (0,2,3)
        pushTriangle([v0, v1, v2], normal, [v0uv, v1uv, v2uv], jointIndex);
        pushTriangle([v0, v2, v3], normal, [v0uv, v2uv, v3uv], jointIndex);
      }
    };

    const appendMesh = (mesh: CanonicalExportModel['meshes'][number]) => {
      const hasBoneRef = Boolean(mesh.bone);
      const boneIdx = mesh.bone ? boneIndexByName.get(mesh.bone) : undefined;
      const jointIndex = hasBoneRef ? (boneIdx === undefined ? rootBoneIndex : boneIdx) : rootBoneIndex;
      if (hasBoneRef && boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

      const vertices = new Map<string, Vec3>();
      mesh.vertices.forEach((v) => vertices.set(v.id, v.pos as Vec3));

      const hasRotation = mesh.rotation !== undefined && !isZeroVec3(mesh.rotation as Vec3);
      const qRot = hasRotation ? quatFromEulerDegXYZ(mesh.rotation as Vec3) : ([0, 0, 0, 1] as Vec4);
      const pivot = (mesh.origin ?? [0, 0, 0]) as Vec3;
      if (hasRotation && !mesh.origin) warnings.add('GLT-WARN-MESH_PIVOT_MISSING');

      const rotatePos = (p: Vec3): Vec3 => {
        if (!hasRotation || !mesh.origin) return p;
        const relative = vec3Sub(p, pivot);
        const rotated = rotateVec3ByQuat(qRot, relative);
        return vec3Add(pivot, rotated);
      };

      mesh.faces.forEach((face) => {
        if (face.vertices.length < 3) return;
        const uvMap = new Map<string, Vec2>();
        (face.uv ?? []).forEach((entry) => uvMap.set(entry.vertexId, entry.uv as Vec2));

        const ids = face.vertices;
        const v0Id = ids[0]!;
        for (let i = 1; i < ids.length - 1; i += 1) {
          const v1Id = ids[i]!;
          const v2Id = ids[i + 1]!;

          const p0 = rotatePos((vertices.get(v0Id) ?? [0, 0, 0]) as Vec3);
          const p1 = rotatePos((vertices.get(v1Id) ?? [0, 0, 0]) as Vec3);
          const p2 = rotatePos((vertices.get(v2Id) ?? [0, 0, 0]) as Vec3);

          const edge1 = vec3Sub(p1, p0);
          const edge2 = vec3Sub(p2, p0);
          let normal = vec3Normalize(vec3Cross(edge1, edge2));
          if (vec3Length(vec3Cross(edge1, edge2)) === 0) {
            warnings.add('GLT-WARN-DEGENERATE_TRIANGLE');
            normal = [0, 0, 1];
          }

          const uvFor = (id: string): Vec2 => {
            const uvPx = uvMap.get(id);
            if (!uvPx) {
              warnings.add('GLT-WARN-MESH_UV_MISSING');
              return [0, 0];
            }
            return [sanitizeNumber(uvPx[0] / tw), sanitizeNumber(uvPx[1] / th)];
          };

          pushTriangle([p0, p1, p2], normal, [uvFor(v0Id), uvFor(v1Id), uvFor(v2Id)], jointIndex);
        }
      });
    };

    model.cubes.forEach(appendCube);
    model.meshes.forEach(appendMesh);

    const vertexCount = Math.floor(positions.length / 3);

    // Animations.
    const epsilon = normalizeTimeEpsilon(model.timePolicy.timeEpsilon);
    const samplersByAnimation: BuiltSampler[][] = [];
    const animations: GltfAnimation[] = [];
    let anyTriggers = false;
    model.animations.forEach((clip) => {
      if (clip.triggers.length > 0) anyTriggers = true;

      const builtSamplers: BuiltSampler[] = [];
      const tracks = [...clip.channels].sort((a, b) => {
        const ai = boneIndexByName.get(a.bone) ?? rootBoneIndex;
        const bi = boneIndexByName.get(b.bone) ?? rootBoneIndex;
        if (ai !== bi) return ai - bi;
        return channelOrder(a.channel) - channelOrder(b.channel);
      });

      tracks.forEach((track) => {
        const boneIdx = boneIndexByName.get(track.bone);
        const nodeIndex = boneIdx === undefined ? rootBoneIndex : boneIdx;
        if (boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

        const baseT = boneLocalTranslation(nodeIndex);
        const baseR = boneBaseRotationQuat(nodeIndex);
        const baseS = boneBaseScale(nodeIndex);

        const decoded = decodeTrackKeys(track.keys, epsilon);
        if (decoded.length === 0) return;

        const interpolation = pickInterpolation(decoded, warnings);

        if (track.channel === 'pos') {
          const inputTimes = decoded.map((k) => k.timeN);
          const outputValues: number[] = [];
          decoded.forEach((k) => {
            const vKey = (k.vector ?? [0, 0, 0]) as Vec3;
            const t = vec3Add(baseT, vKey);
            outputValues.push(t[0], t[1], t[2]);
          });
          builtSamplers.push({
            inputTimes,
            outputValues,
            outputType: 'VEC3',
            interpolation,
            nodeIndex,
            path: 'translation'
          });
          return;
        }

        if (track.channel === 'scale') {
          const inputTimes = decoded.map((k) => k.timeN);
          const outputValues: number[] = [];
          decoded.forEach((k) => {
            const vKey = (k.vector ?? [1, 1, 1]) as Vec3;
            const s = vec3Mul(baseS, vKey);
            outputValues.push(s[0], s[1], s[2]);
          });
          builtSamplers.push({
            inputTimes,
            outputValues,
            outputType: 'VEC3',
            interpolation,
            nodeIndex,
            path: 'scale'
          });
          return;
        }

        // rot
        const inputTimes = decoded.map((k) => k.timeN);
        const outputValues: number[] = [];
        decoded.forEach((k) => {
          const vKey = (k.vector ?? [0, 0, 0]) as Vec3;
          const delta = quatFromEulerDegXYZ(vKey);
          const q = quatNormalize(quatMul(baseR, delta));
          outputValues.push(q[0], q[1], q[2], q[3]);
        });
        builtSamplers.push({
          inputTimes,
          outputValues,
          outputType: 'VEC4',
          interpolation,
          nodeIndex,
          path: 'rotation'
        });
      });

      const samplers: GltfAnimationSampler[] = [];
      const channels: GltfAnimationChannel[] = [];
      builtSamplers.forEach((sampler, idx) => {
        // Accessor indices are assigned later during packing.
        samplers.push({
          input: -1,
          output: -1,
          interpolation: sampler.interpolation
        });
        channels.push({
          sampler: idx,
          target: { node: sampler.nodeIndex, path: sampler.path }
        });
      });

      animations.push({
        name: clip.name,
        samplers,
        channels,
        extras: {
          ashfox: {
            loop: Boolean(clip.loop),
            length: sanitizeNumber(clip.length),
            ...(clip.fps !== undefined ? { fps: sanitizeNumber(clip.fps) } : {})
          }
        }
      });
      samplersByAnimation.push(builtSamplers);
    });

    if (anyTriggers) warnings.add('GLT-WARN-TRIGGERS_DROPPED');

    // IBM buffer section.
    const localMatrices: Mat4[] = bones.map((_, idx) => {
      const t = boneLocalTranslation(idx);
      const r = boneBaseRotationQuat(idx);
      const s = boneBaseScale(idx);
      return mat4FromTrs(t, r, s);
    });

    const globalMatrices: Array<Mat4 | null> = bones.map(() => null);
    const visiting = new Set<number>();
    const computeGlobal = (idx: number): Mat4 => {
      const cached = globalMatrices[idx];
      if (cached) return cached;
      if (visiting.has(idx)) return localMatrices[idx]!;
      visiting.add(idx);
      const p = parentIndex[idx] ?? -1;
      const local = localMatrices[idx]!;
      const global = p < 0 ? local : mat4Multiply(computeGlobal(p), local);
      visiting.delete(idx);
      globalMatrices[idx] = global;
      return global;
    };

    const inverseBindMatrices: number[] = [];
    for (let i = 0; i < bones.length; i += 1) {
      const global = computeGlobal(i);
      const inv = mat4Invert(global);
      inverseBindMatrices.push(...inv);
    }

    // Pack buffer.
    const bufferViews: GltfBufferView[] = [];
    const accessors: GltfAccessor[] = [];
    const writer = new ByteWriter();

    const pushSection = (data: Uint8Array): { offset: number; length: number } => {
      writer.align4();
      const offset = writer.length;
      writer.append(data);
      return { offset, length: data.length };
    };

    const ibmSec = pushSection(packFloat32(inverseBindMatrices));
    const posSec = pushSection(packFloat32(positions));
    const nrmSec = pushSection(packFloat32(normals));
    const uvSec = pushSection(packFloat32(texcoords));
    const jntSec = pushSection(packUint16(joints));
    const wgtSec = pushSection(packFloat32(weights));

    const baseBufferViews = [ibmSec, posSec, nrmSec, uvSec, jntSec, wgtSec];
    baseBufferViews.forEach((sec) => {
      bufferViews.push({ buffer: 0, byteOffset: sec.offset, byteLength: sec.length });
    });

    accessors.push({
      bufferView: 0,
      componentType: 5126,
      count: bones.length,
      type: 'MAT4'
    });
    accessors.push({
      bufferView: 1,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    });
    accessors.push({
      bufferView: 2,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    });
    accessors.push({
      bufferView: 3,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC2'
    });
    accessors.push({
      bufferView: 4,
      componentType: 5123,
      count: vertexCount,
      type: 'VEC4'
    });
    accessors.push({
      bufferView: 5,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC4'
    });

    // Animation data packing.
    let nextAccessorIndex = 6;
    let nextBufferViewIndex = 6;
    animations.forEach((anim, animIdx) => {
      const built = samplersByAnimation[animIdx] ?? [];
      built.forEach((sampler, samplerIdx) => {
        const inputSec = pushSection(packFloat32(sampler.inputTimes));
        bufferViews.push({ buffer: 0, byteOffset: inputSec.offset, byteLength: inputSec.length });
        const inputAccessor = nextAccessorIndex++;
        accessors.push({
          bufferView: nextBufferViewIndex++,
          componentType: 5126,
          count: sampler.inputTimes.length,
          type: 'SCALAR'
        });

        const outputSec = pushSection(packFloat32(sampler.outputValues));
        bufferViews.push({ buffer: 0, byteOffset: outputSec.offset, byteLength: outputSec.length });
        const outputAccessor = nextAccessorIndex++;
        accessors.push({
          bufferView: nextBufferViewIndex++,
          componentType: 5126,
          count: sampler.outputType === 'VEC4' ? sampler.outputValues.length / 4 : sampler.outputValues.length / 3,
          type: sampler.outputType
        });

        anim.samplers[samplerIdx] = {
          input: inputAccessor,
          output: outputAccessor,
          interpolation: sampler.interpolation
        };
      });
    });

    const bufferBytes = writer.toUint8Array();
    const bufferDataUri = encodeDataUri('application/octet-stream', bufferBytes);

    const primaryTexture = model.textures[0];
    const textureDataUri = primaryTexture?.dataUri;
    const hasTexture = typeof textureDataUri === 'string' && textureDataUri.length > 0;
    if (!hasTexture) warnings.add('GLT-WARN-TEXTURE_DATA_MISSING');

    const material: GltfMaterial = hasTexture
      ? {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            metallicFactor: 0.0,
            roughnessFactor: 1.0
          },
          doubleSided: true
        }
      : {
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0.0,
            roughnessFactor: 1.0
          },
          doubleSided: true
        };

    const gltf: GltfDocument = {
      asset: { version: '2.0', generator: 'ashfox gltf_codec v1' },
      scene: 0,
      scenes: [{ nodes: rootNodes }],
      nodes,
      meshes: [
        {
          primitives: [
            {
              attributes: {
                POSITION: 1,
                NORMAL: 2,
                TEXCOORD_0: 3,
                JOINTS_0: 4,
                WEIGHTS_0: 5
              },
              mode: 4,
              material: 0
            }
          ]
        }
      ],
      skins: [
        {
          joints: bones.map((_, idx) => idx),
          skeleton: skeletonIndex,
          inverseBindMatrices: 0
        }
      ],
      buffers: [{ byteLength: bufferBytes.length, uri: bufferDataUri }],
      bufferViews,
      accessors,
      materials: [material],
      animations
    };

    if (hasTexture) {
      gltf.samplers = [
        { magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }
      ];
      gltf.images = [{ uri: textureDataUri }];
      gltf.textures = [{ sampler: 0, source: 0 }];
    }

    return {
      artifacts: [
        {
          id: 'gltf',
          data: gltf,
          path: { mode: 'base_suffix', suffix: '.gltf' },
          primary: true
        }
      ],
      warnings: [...warnings].sort(),
      lossy: warnings.size > 0
    };
  }
}
