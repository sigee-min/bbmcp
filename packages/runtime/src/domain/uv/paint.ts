import type { TextureUsage } from '../model';
import type { DomainResult } from '../result';
import type { UvPaintScope } from './paintSpec';
import { buildTargetFilters, filterByTargetFilters } from '../targetFilters';
import type { UvPaintMessages, UvPaintRect, UvPaintResolveInput } from './paintTypes';

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
  usage: TextureUsage,
  messages: UvPaintMessages
): DomainResult<{ rects: UvPaintRect[] }> => {
  const label = texture.name ?? texture.targetName ?? texture.targetId ?? 'texture';
  const uvPaint = texture.uvPaint;
  if (!uvPaint) {
    return { ok: true, data: { rects: [] } };
  }
  const entry = resolveUsageEntry(texture, usage);
  if (!entry) {
    return err('invalid_state', messages.usageMissing(label), { reason: 'usage_missing' });
  }
  const cubeFilters = buildTargetFilters(uvPaint.target?.cubeIds, uvPaint.target?.cubeNames);
  const faces = uvPaint.target?.faces ? new Set(uvPaint.target.faces) : null;
  const filteredCubes = filterByTargetFilters(entry.cubes, cubeFilters);
  if (cubeFilters.hasFilters && filteredCubes.length === 0) {
    return err('invalid_state', messages.targetCubesNotFound(label), { reason: 'target_cubes_not_found' });
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
    return err('invalid_state', messages.targetFacesNotFound(label), { reason: 'target_faces_not_found' });
  }
  if (rects.length === 0) {
    return err('invalid_state', messages.noRects(label), { reason: 'no_rects' });
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
        error: { code: 'invalid_state', message: messages.noBounds(label), details: { reason: 'no_bounds' } }
      };
    }
    return { ok: true, data: { rects: [bounds] } };
  }
  if (scope === 'rects') {
    return { ok: true, data: { rects: dedupeRects(rects) } };
  }
  return { ok: true, data: { rects } };
};

const err = <T = never>(
  code: 'invalid_payload' | 'invalid_state',
  message: string,
  details?: Record<string, unknown>
): DomainResult<T> => ({
  ok: false,
  error: { code, message, details }
});




