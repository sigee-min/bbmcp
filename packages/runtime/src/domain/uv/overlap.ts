import type { CubeFaceDirection, TextureUsage } from '../model';

export type UvRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type UvFaceRect = {
  cubeName: string;
  face: CubeFaceDirection;
  rect: UvRect;
};

export type UvOverlapExample = {
  a: UvFaceRect;
  b: UvFaceRect;
};

export type UvOverlapIssue = {
  textureId?: string;
  textureName: string;
  conflictCount: number;
  example?: UvOverlapExample;
};

type RectGroup = {
  key: string;
  rect: UvRect;
  faces: UvFaceRect[];
};

export const findUvOverlapIssues = (usage: TextureUsage): UvOverlapIssue[] => {
  const issues: UvOverlapIssue[] = [];
  usage.textures.forEach((entry) => {
    const rectGroups = collectRectGroups(entry);
    const conflicts = findRectConflicts(rectGroups);
    if (conflicts.count <= 0) return;
    issues.push({
      textureId: entry.id ?? undefined,
      textureName: entry.name,
      conflictCount: conflicts.count,
      example: conflicts.example ?? undefined
    });
  });
  return issues;
};

export const formatUvRect = (rect: UvRect): string =>
  `[${formatCoord(rect.x1)},${formatCoord(rect.y1)},${formatCoord(rect.x2)},${formatCoord(rect.y2)}]`;

export const formatUvFaceRect = (face: UvFaceRect): string =>
  `${face.cubeName} (${face.face}) ${formatUvRect(face.rect)}`;

const collectRectGroups = (entry: TextureUsage['textures'][number]): RectGroup[] => {
  const groups: RectGroup[] = [];
  entry.cubes.forEach((cube) => {
    cube.faces.forEach((face) => {
      if (!face.uv) return;
      const rect = toRect(face.uv);
      if (!rect) return;
      const key = `${cube.name}:${face.face}`;
      groups.push({
        key,
        rect,
        faces: [{ cubeName: cube.name, face: face.face, rect }]
      });
    });
  });
  return groups;
};

const findRectConflicts = (groups: RectGroup[]): { count: number; example?: UvOverlapExample } => {
  let count = 0;
  let example: UvOverlapExample | undefined;
  for (let i = 0; i < groups.length; i += 1) {
    const current = groups[i];
    for (let j = i + 1; j < groups.length; j += 1) {
      const other = groups[j];
      if (!rectsOverlap(current.rect, other.rect)) continue;
      count += 1;
      if (!example && current.faces[0] && other.faces[0]) {
        example = { a: current.faces[0], b: other.faces[0] };
      }
    }
  }
  return { count, example };
};

const toRect = (uv: [number, number, number, number]): UvRect | null => {
  const [x1, y1, x2, y2] = uv;
  const minX = normalizeCoord(Math.min(x1, x2));
  const maxX = normalizeCoord(Math.max(x1, x2));
  const minY = normalizeCoord(Math.min(y1, y2));
  const maxY = normalizeCoord(Math.max(y1, y2));
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }
  if (maxX <= minX || maxY <= minY) return null;
  return { x1: minX, y1: minY, x2: maxX, y2: maxY };
};

const rectsOverlap = (a: UvRect, b: UvRect): boolean =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

const normalizeCoord = (value: number): number => (Object.is(value, -0) ? 0 : value);

const formatCoord = (value: number): string => {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
};



