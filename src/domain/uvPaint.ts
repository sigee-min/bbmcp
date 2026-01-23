import type { Limits, TextureUsage } from './model';
import type { DomainResult } from './result';
import type { UvPaintScope, UvPaintSpec } from './uvPaintSpec';

export type UvPaintRect = { x1: number; y1: number; x2: number; y2: number };

export type UvPaintResolveInput = {
  id?: string;
  name?: string;
  targetId?: string;
  targetName?: string;
  uvPaint?: UvPaintSpec;
};

type UsageEntry = TextureUsage['textures'][number];

const normalizeRect = (uv: [number, number, number, number]): UvPaintRect => {
  const [x1, y1, x2, y2] = uv;
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2)
  };
};

const resolveUsageEntry = (texture: UvPaintResolveInput, usage: TextureUsage): UsageEntry | null => {
  if (texture.targetId) {
    const byId = usage.textures.find((entry) => entry.id === texture.targetId);
    if (byId) return byId;
  }
  if (texture.targetName) {
    const byName = usage.textures.find((entry) => entry.name === texture.targetName);
    if (byName) return byName;
  }
  if (texture.id) {
    const byId = usage.textures.find((entry) => entry.id === texture.id);
    if (byId) return byId;
  }
  if (texture.name) {
    const byName = usage.textures.find((entry) => entry.name === texture.name);
    if (byName) return byName;
  }
  return null;
};

const dedupeRects = (rects: UvPaintRect[]): UvPaintRect[] => {
  const seen = new Set<string>();
  const out: UvPaintRect[] = [];
  rects.forEach((rect) => {
    const key = `${rect.x1},${rect.y1},${rect.x2},${rect.y2}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(rect);
  });
  return out;
};

const resolveScope = (scope?: UvPaintScope): UvPaintScope => scope ?? 'rects';

export const resolveUvPaintRects = (
  texture: UvPaintResolveInput,
  usage: TextureUsage
): DomainResult<{ rects: UvPaintRect[] }> => {
  const label = texture.name ?? texture.targetName ?? texture.targetId ?? 'texture';
  const uvPaint = texture.uvPaint;
  if (!uvPaint) {
    return { ok: true, data: { rects: [] } };
  }
  const entry = resolveUsageEntry(texture, usage);
  if (!entry) {
    return err(
      'invalid_state',
      `No UV usage found for texture "${label}". Assign the texture and set per-face UVs before uvPaint.`
    );
  }
  const cubeIds = new Set(uvPaint.target?.cubeIds ?? []);
  const cubeNames = new Set(uvPaint.target?.cubeNames ?? []);
  const faces = uvPaint.target?.faces ? new Set(uvPaint.target.faces) : null;
  const filteredCubes = entry.cubes.filter(
    (cube) =>
      (cubeIds.size === 0 && cubeNames.size === 0) ||
      (cube.id && cubeIds.has(cube.id)) ||
      cubeNames.has(cube.name)
  );
  if ((cubeIds.size > 0 || cubeNames.size > 0) && filteredCubes.length === 0) {
    return err('invalid_state', `uvPaint target cubes not found for texture "${label}".`);
  }
  const rects: UvPaintRect[] = [];
  let matchedFaces = 0;
  filteredCubes.forEach((cube) => {
    cube.faces.forEach((face) => {
      if (faces && !faces.has(face.face)) return;
      matchedFaces += 1;
      if (!face.uv) return;
      rects.push(normalizeRect(face.uv));
    });
  });
  if (faces && matchedFaces === 0) {
    return err('invalid_state', `uvPaint target faces not found for texture "${label}".`);
  }
  if (rects.length === 0) {
    return err('invalid_state', `No UV rects found for texture "${label}". Set per-face UVs before uvPaint.`);
  }
  const scope = resolveScope(uvPaint.scope);
  if (scope === 'bounds') {
    const bounds = rects.reduce(
      (acc, rect) => ({
        x1: Math.min(acc.x1, rect.x1),
        y1: Math.min(acc.y1, rect.y1),
        x2: Math.max(acc.x2, rect.x2),
        y2: Math.max(acc.y2, rect.y2)
      }),
      { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
    );
    if (!Number.isFinite(bounds.x1) || !Number.isFinite(bounds.y1)) {
      return {
        ok: false,
        error: { code: 'invalid_state', message: `No UV bounds found for texture "${label}".` }
      };
    }
    return { ok: true, data: { rects: [bounds] } };
  }
  if (scope === 'rects') {
    return { ok: true, data: { rects: dedupeRects(rects) } };
  }
  return { ok: true, data: { rects } };
};

const VALID_FACES = new Set(['north', 'south', 'east', 'west', 'up', 'down']);

export const validateUvPaintSpec = (value: unknown, limits: Limits, label: string): DomainResult<unknown> => {
  if (!isRecord(value)) {
    return err('invalid_payload', `uvPaint must be an object (${label})`);
  }
  if (value.scope !== undefined && !['faces', 'rects', 'bounds'].includes(String(value.scope))) {
    return err('invalid_payload', `uvPaint scope invalid (${label})`);
  }
  if (value.mapping !== undefined && !['stretch', 'tile'].includes(String(value.mapping))) {
    return err('invalid_payload', `uvPaint mapping invalid (${label})`);
  }
  if (value.padding !== undefined && (!isFiniteNumber(value.padding) || value.padding < 0)) {
    return err('invalid_payload', `uvPaint padding invalid (${label})`);
  }
  if (value.anchor !== undefined) {
    if (!Array.isArray(value.anchor) || value.anchor.length !== 2) {
      return err('invalid_payload', `uvPaint anchor must be [x,y] (${label})`);
    }
    if (!isFiniteNumber(value.anchor[0]) || !isFiniteNumber(value.anchor[1])) {
      return err('invalid_payload', `uvPaint anchor must be numbers (${label})`);
    }
  }
  if (value.source !== undefined) {
    if (!isRecord(value.source)) {
      return err('invalid_payload', `uvPaint source must be an object (${label})`);
    }
    const width = value.source.width;
    const height = value.source.height;
    if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
      return err('invalid_payload', `uvPaint source width/height required (${label})`);
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      return err('invalid_payload', `uvPaint source width/height must be positive integers (${label})`);
    }
    if (width > limits.maxTextureSize || height > limits.maxTextureSize) {
      return err('invalid_payload', `uvPaint source size exceeds max ${limits.maxTextureSize} (${label})`);
    }
  }
  if (value.target !== undefined) {
    if (!isRecord(value.target)) {
      return err('invalid_payload', `uvPaint target must be an object (${label})`);
    }
    if (value.target.cubeIds !== undefined) {
      if (!Array.isArray(value.target.cubeIds) || value.target.cubeIds.length === 0) {
        return err('invalid_payload', `uvPaint target cubeIds must be a non-empty array (${label})`);
      }
      if (!value.target.cubeIds.every((id: unknown) => typeof id === 'string')) {
        return err('invalid_payload', `uvPaint target cubeIds must be strings (${label})`);
      }
    }
    if (value.target.cubeNames !== undefined) {
      if (!Array.isArray(value.target.cubeNames) || value.target.cubeNames.length === 0) {
        return err('invalid_payload', `uvPaint target cubeNames must be a non-empty array (${label})`);
      }
      if (!value.target.cubeNames.every((name: unknown) => typeof name === 'string')) {
        return err('invalid_payload', `uvPaint target cubeNames must be strings (${label})`);
      }
    }
    if (value.target.faces !== undefined) {
      if (!Array.isArray(value.target.faces) || value.target.faces.length === 0) {
        return err('invalid_payload', `uvPaint target faces must be a non-empty array (${label})`);
      }
      if (!value.target.faces.every((face: unknown) => typeof face === 'string' && VALID_FACES.has(face))) {
        return err('invalid_payload', `uvPaint target faces invalid (${label})`);
      }
    }
  }
  return { ok: true, data: { valid: true } };
};

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const err = <T = never>(code: 'invalid_payload' | 'invalid_state', message: string): DomainResult<T> => ({
  ok: false,
  error: { code, message }
});
