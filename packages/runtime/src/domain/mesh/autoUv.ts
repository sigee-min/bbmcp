export type MeshSymmetryAxis = 'none' | 'x' | 'y' | 'z';

export type MeshUvPolicy = {
  symmetryAxis?: MeshSymmetryAxis;
  texelDensity?: number;
  padding?: number;
};

export type MeshVertex = { id: string; pos: [number, number, number] };
export type MeshFaceUv = { vertexId: string; uv: [number, number] };
export type MeshFace = { id?: string; vertices: string[]; uv?: MeshFaceUv[]; texture?: string | false };

type ProjectionAxis = 'x' | 'y' | 'z';
type FaceProjection = {
  id: string;
  index: number;
  vertices: string[];
  texture?: string | false;
  projected: Array<{ vertexId: string; u: number; v: number }>;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  rawW: number;
  rawH: number;
};

type PackedRect = {
  id: string;
  w: number;
  h: number;
  x: number;
  y: number;
};

export type AutoMeshUvInput = {
  vertices: MeshVertex[];
  faces: MeshFace[];
  textureWidth: number;
  textureHeight: number;
  policy?: MeshUvPolicy;
};

export type AutoMeshUvResult = {
  faces: MeshFace[];
  policy: Required<MeshUvPolicy>;
};

const DEFAULT_POLICY: Required<MeshUvPolicy> = {
  symmetryAxis: 'none',
  texelDensity: 8,
  padding: 1
};

const MIN_DENSITY = 0.25;
const MAX_DENSITY = 64;
const MIN_PADDING = 0;
const MAX_PADDING = 16;

export const normalizeMeshUvPolicy = (policy?: MeshUvPolicy): Required<MeshUvPolicy> => {
  const symmetryAxis = isSymmetryAxis(policy?.symmetryAxis) ? policy!.symmetryAxis : DEFAULT_POLICY.symmetryAxis;
  const texelDensity = clampFinite(policy?.texelDensity, MIN_DENSITY, MAX_DENSITY, DEFAULT_POLICY.texelDensity);
  const padding = Math.trunc(clampFinite(policy?.padding, MIN_PADDING, MAX_PADDING, DEFAULT_POLICY.padding));
  return {
    symmetryAxis,
    texelDensity,
    padding
  };
};

export const autoMapMeshUv = (input: AutoMeshUvInput): AutoMeshUvResult => {
  const textureWidth = Math.max(1, Math.trunc(input.textureWidth || 1));
  const textureHeight = Math.max(1, Math.trunc(input.textureHeight || 1));
  const policy = normalizeMeshUvPolicy(input.policy);
  const vertexMap = new Map(input.vertices.map((vertex) => [vertex.id, vertex.pos] as const));
  const faces = input.faces.map((face, index) => ({ ...face, id: face.id ?? `f${index}` }));
  const projections = buildFaceProjections(faces, vertexMap, policy.symmetryAxis);

  const packed = packFaceRects(projections, textureWidth, textureHeight, policy.texelDensity, policy.padding);
  if (!packed) {
    return {
      faces: faces.map((face) => ({
        id: face.id,
        vertices: [...face.vertices],
        ...(face.texture !== undefined ? { texture: face.texture } : {}),
        uv: face.vertices.map((vertexId) => ({ vertexId, uv: [0, 0] }))
      })),
      policy
    };
  }

  const rectById = new Map(packed.rects.map((rect) => [rect.id, rect] as const));
  const mapped = projections.map((projection) => {
    const rect = rectById.get(projection.id)!;
    const writableW = Math.max(1, rect.w - policy.padding * 2);
    const writableH = Math.max(1, rect.h - policy.padding * 2);
    const uv = projection.projected.map((entry) => {
      const uNorm = (entry.u - projection.minU) / projection.rawW;
      const vNorm = (entry.v - projection.minV) / projection.rawH;
      const u = rect.x + policy.padding + uNorm * writableW;
      const v = rect.y + policy.padding + vNorm * writableH;
      return { vertexId: entry.vertexId, uv: [round4(u), round4(v)] as [number, number] };
    });
    const face = faces[projection.index]!;
    return {
      id: projection.id,
      vertices: [...projection.vertices],
      ...(face.texture !== undefined ? { texture: face.texture } : {}),
      uv
    };
  });
  return {
    faces: mapped,
    policy: {
      ...policy,
      texelDensity: packed.appliedDensity
    }
  };
};

const buildFaceProjections = (
  faces: Array<MeshFace & { id: string }>,
  vertexMap: Map<string, [number, number, number]>,
  symmetryAxis: MeshSymmetryAxis
): FaceProjection[] =>
  faces.map((face, index) => {
    const points = face.vertices.map((vertexId) => applySymmetry(vertexMap.get(vertexId) ?? [0, 0, 0], symmetryAxis));
    const normal = computeFaceNormal(points);
    const axis = pickProjectionAxis(normal);
    const projected = face.vertices.map((vertexId) => {
      const pos = applySymmetry(vertexMap.get(vertexId) ?? [0, 0, 0], symmetryAxis);
      const [u, v] = projectByAxis(pos, axis);
      return { vertexId, u, v };
    });
    const bounds = projected.reduce(
      (acc, point) => ({
        minU: Math.min(acc.minU, point.u),
        maxU: Math.max(acc.maxU, point.u),
        minV: Math.min(acc.minV, point.v),
        maxV: Math.max(acc.maxV, point.v)
      }),
      { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity }
    );
    const rawW = Math.max(1e-6, bounds.maxU - bounds.minU);
    const rawH = Math.max(1e-6, bounds.maxV - bounds.minV);
    return {
      id: face.id,
      index,
      vertices: face.vertices,
      texture: face.texture,
      projected,
      minU: bounds.minU,
      maxU: bounds.maxU,
      minV: bounds.minV,
      maxV: bounds.maxV,
      rawW,
      rawH
    };
  });

const packFaceRects = (
  projections: FaceProjection[],
  textureWidth: number,
  textureHeight: number,
  baseDensity: number,
  padding: number
): { rects: PackedRect[]; appliedDensity: number } | null => {
  let density = baseDensity;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const dims = projections.map((projection) => ({
      id: projection.id,
      w: Math.max(1, Math.ceil(projection.rawW * density)) + padding * 2,
      h: Math.max(1, Math.ceil(projection.rawH * density)) + padding * 2
    }));
    const packed = packRectsRowWise(dims, textureWidth, textureHeight);
    if (packed) {
      return { rects: packed, appliedDensity: density };
    }
    if (density <= MIN_DENSITY) return null;
    density = Math.max(MIN_DENSITY, density * 0.82);
  }
  return null;
};

const packRectsRowWise = (
  rects: Array<{ id: string; w: number; h: number }>,
  maxW: number,
  maxH: number
): PackedRect[] | null => {
  const sorted = [...rects].sort((a, b) => (b.h - a.h) || (b.w - a.w));
  const placements: PackedRect[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const rect of sorted) {
    if (rect.w > maxW || rect.h > maxH) return null;
    if (x + rect.w > maxW) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    if (y + rect.h > maxH) return null;
    placements.push({ ...rect, x, y });
    x += rect.w;
    rowH = Math.max(rowH, rect.h);
  }
  return placements;
};

const applySymmetry = (
  pos: [number, number, number],
  axis: MeshSymmetryAxis
): [number, number, number] => {
  switch (axis) {
    case 'x':
      return [Math.abs(pos[0]), pos[1], pos[2]];
    case 'y':
      return [pos[0], Math.abs(pos[1]), pos[2]];
    case 'z':
      return [pos[0], pos[1], Math.abs(pos[2])];
    default:
      return pos;
  }
};

const computeFaceNormal = (points: Array<[number, number, number]>): [number, number, number] => {
  if (points.length < 3) return [0, 0, 1];
  const a = points[0]!;
  const b = points[1]!;
  const c = points[2]!;
  const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = ab[1] * ac[2] - ab[2] * ac[1];
  const ny = ab[2] * ac[0] - ab[0] * ac[2];
  const nz = ab[0] * ac[1] - ab[1] * ac[0];
  return [nx, ny, nz];
};

const pickProjectionAxis = (normal: [number, number, number]): ProjectionAxis => {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= ax && ay >= az) return 'y';
  return 'z';
};

const projectByAxis = (pos: [number, number, number], axis: ProjectionAxis): [number, number] => {
  if (axis === 'x') return [pos[2], pos[1]];
  if (axis === 'y') return [pos[0], pos[2]];
  return [pos[0], pos[1]];
};

const clampFinite = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
};

const isSymmetryAxis = (value: unknown): value is MeshSymmetryAxis =>
  value === 'none' || value === 'x' || value === 'y' || value === 'z';

const round4 = (value: number): number => Math.round(value * 10000) / 10000;
