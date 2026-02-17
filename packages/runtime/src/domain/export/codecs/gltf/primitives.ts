export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export const sanitizeNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (Object.is(numeric, -0)) return 0;
  return numeric;
};

export const isZeroVec3 = (value: Vec3 | undefined): boolean => {
  if (!value) return true;
  return sanitizeNumber(value[0]) === 0 && sanitizeNumber(value[1]) === 0 && sanitizeNumber(value[2]) === 0;
};

export const vec3Sub = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] - b[0]),
  sanitizeNumber(a[1] - b[1]),
  sanitizeNumber(a[2] - b[2])
];

export const vec3Add = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] + b[0]),
  sanitizeNumber(a[1] + b[1]),
  sanitizeNumber(a[2] + b[2])
];

export const vec3Mul = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[0] * b[0]),
  sanitizeNumber(a[1] * b[1]),
  sanitizeNumber(a[2] * b[2])
];

export const vec3Cross = (a: Vec3, b: Vec3): Vec3 => [
  sanitizeNumber(a[1] * b[2] - a[2] * b[1]),
  sanitizeNumber(a[2] * b[0] - a[0] * b[2]),
  sanitizeNumber(a[0] * b[1] - a[1] * b[0])
];

export const vec3Length = (v: Vec3): number =>
  Math.sqrt(sanitizeNumber(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]));

export const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 1];
  return [sanitizeNumber(v[0] / len), sanitizeNumber(v[1] / len), sanitizeNumber(v[2] / len)];
};

const degToRad = (deg: number): number => sanitizeNumber(deg) * (Math.PI / 180);

export const quatNormalize = (q: Vec4): Vec4 => {
  const x = sanitizeNumber(q[0]);
  const y = sanitizeNumber(q[1]);
  const z = sanitizeNumber(q[2]);
  const w = sanitizeNumber(q[3]);
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0, 1];
  return [x / len, y / len, z / len, w / len];
};

// Hamilton product q ⊗ p (both [x,y,z,w]).
export const quatMul = (q: Vec4, p: Vec4): Vec4 => {
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

export const quatFromEulerDegXYZ = (deg: Vec3): Vec4 => {
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

export const rotateVec3ByQuat = (qRaw: Vec4, v: Vec3): Vec3 => {
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

export const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
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

export const mat4Invert = (m: Mat4): Mat4 => {
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

export const mat4FromTrs = (t: Vec3, r: Vec4, s: Vec3): Mat4 =>
  mat4Multiply(mat4Multiply(mat4FromTranslation(t), mat4FromQuat(r)), mat4FromScale(s));
