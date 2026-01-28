import type { Limits } from './model';
import type { DomainResult } from './result';
import { fail, ok } from './result';
import { checkDimensions, mapDimensionError } from './dimensions';
import { validateUvPaintSpec } from './uvPaint';
import { isTextureOp, MAX_TEXTURE_OPS } from './textureOps';
import {
  TEXTURE_DIMENSION_POSITIVE,
  TEXTURE_OP_INVALID,
  TEXTURE_OPS_TOO_MANY,
  TEXTURE_SPECS_REQUIRED,
  TEXTURE_SPEC_MODE_UNSUPPORTED,
  TEXTURE_SPEC_NAME_REQUIRED,
  TEXTURE_SPEC_TARGET_REQUIRED,
  TEXTURE_SIZE_EXCEEDS_MAX
} from '../shared/messages';

export type TextureSpecLike = {
  mode?: 'create' | 'update';
  id?: string;
  targetId?: string;
  targetName?: string;
  name?: string;
  width?: number;
  height?: number;
  uvPaint?: unknown;
  ops?: unknown[];
  detectNoChange?: boolean;
};

export type TextureSpecWithSize = TextureSpecLike & {
  width: number;
  height: number;
};

export const normalizeTextureSpecSize = (
  spec: TextureSpecLike,
  fallback?: { width?: number; height?: number }
): DomainResult<TextureSpecWithSize> => {
  const width = pickFinite(spec.width, fallback?.width);
  const height = pickFinite(spec.height, fallback?.height);
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return fail('invalid_payload', TEXTURE_DIMENSION_POSITIVE('width', specLabel(spec)));
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
    return fail('invalid_payload', TEXTURE_DIMENSION_POSITIVE('height', specLabel(spec)));
  }
  return ok({ ...spec, width, height });
};

export const validateTextureSpecs = (
  textures: TextureSpecLike[],
  limits: Limits
): DomainResult<{ valid: true }> => {
  if (!Array.isArray(textures) || textures.length === 0) {
    return fail('invalid_payload', TEXTURE_SPECS_REQUIRED);
  }
  for (const tex of textures) {
    const label = tex?.name ?? tex?.targetName ?? tex?.targetId ?? 'texture';
    const mode = tex?.mode ?? 'create';
    if (mode !== 'create' && mode !== 'update') {
      return fail('invalid_payload', TEXTURE_SPEC_MODE_UNSUPPORTED(mode, label));
    }
    if (mode === 'create' && !tex?.name) {
      return fail('invalid_payload', TEXTURE_SPEC_NAME_REQUIRED(label));
    }
    if (mode === 'update' && !tex?.targetId && !tex?.targetName) {
      return fail('invalid_payload', TEXTURE_SPEC_TARGET_REQUIRED(label));
    }
    const sizeRes = normalizeTextureSpecSize(tex);
    if (!sizeRes.ok) return sizeRes;
    const width = Number(sizeRes.data.width);
    const height = Number(sizeRes.data.height);
    const sizeCheck = checkDimensions(width, height, { requireInteger: false, maxSize: limits.maxTextureSize });
    const sizeMessage = mapDimensionError(sizeCheck, {
      nonPositive: (axis) => TEXTURE_DIMENSION_POSITIVE(axis, label),
      nonInteger: (axis) => TEXTURE_DIMENSION_POSITIVE(axis, label),
      exceedsMax: (maxSize) => TEXTURE_SIZE_EXCEEDS_MAX(maxSize || limits.maxTextureSize, label)
    });
    if (sizeMessage) {
      return fail('invalid_payload', sizeMessage);
    }
    const ops = Array.isArray(tex?.ops) ? tex.ops : [];
    if (ops.length > MAX_TEXTURE_OPS) {
      return fail('invalid_payload', TEXTURE_OPS_TOO_MANY(MAX_TEXTURE_OPS, label));
    }
    for (const op of ops) {
      if (!isTextureOp(op)) {
        return fail('invalid_payload', TEXTURE_OP_INVALID(label));
      }
    }
    if (tex?.uvPaint !== undefined) {
      const uvPaintRes = validateUvPaintSpec(tex.uvPaint, limits, label);
      if (!uvPaintRes.ok) return uvPaintRes as DomainResult<{ valid: true }>;
    }
  }
  return ok({ valid: true });
};

const specLabel = (spec: TextureSpecLike): string =>
  spec?.name ?? spec?.targetName ?? spec?.targetId ?? 'texture';

const pickFinite = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
};
