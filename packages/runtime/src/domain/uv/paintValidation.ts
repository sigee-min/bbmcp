import { CUBE_FACE_DIRECTIONS } from '../model';
import type { Limits } from '../model';
import type { DomainResult } from '../result';
import type { UvPaintMessages } from './paintTypes';
import { isFiniteNumber, isRecord } from '../guards';

const VALID_FACES: ReadonlySet<string> = new Set<string>(CUBE_FACE_DIRECTIONS);

type ValidationContext = {
  limits: Limits;
  label: string;
  messages: UvPaintMessages;
};

type ValidationRule = (value: Record<string, unknown>, ctx: ValidationContext) => DomainResult<unknown> | null;

export const validateUvPaintSpec = (
  value: unknown,
  limits: Limits,
  label: string,
  messages: UvPaintMessages
): DomainResult<unknown> => {
  if (!isRecord(value)) {
    return err('invalid_payload', messages.objectRequired(label));
  }
  const record = value as Record<string, unknown>;
  const context: ValidationContext = { limits, label, messages };
  const topLevelRules: ValidationRule[] = [
    (candidate, innerCtx) =>
      candidate.scope !== undefined && !['faces', 'rects', 'bounds'].includes(String(candidate.scope))
        ? err('invalid_payload', innerCtx.messages.scopeInvalid(innerCtx.label))
        : null,
    (candidate, innerCtx) =>
      candidate.mapping !== undefined && !['stretch', 'tile'].includes(String(candidate.mapping))
        ? err('invalid_payload', innerCtx.messages.mappingInvalid(innerCtx.label))
        : null,
    (candidate, innerCtx) =>
      candidate.padding !== undefined && (!isFiniteNumber(candidate.padding) || candidate.padding < 0)
        ? err('invalid_payload', innerCtx.messages.paddingInvalid(innerCtx.label))
        : null,
    validateAnchor,
    validateSource,
    validateTarget
  ];
  for (const rule of topLevelRules) {
    const failed = rule(record, context);
    if (failed) return failed;
  }
  return { ok: true, data: { valid: true } };
};

function validateAnchor(value: Record<string, unknown>, ctx: ValidationContext): DomainResult<unknown> | null {
  if (value.anchor === undefined) return null;
  if (!Array.isArray(value.anchor) || value.anchor.length !== 2) {
    return err('invalid_payload', ctx.messages.anchorFormat(ctx.label));
  }
  if (!isFiniteNumber(value.anchor[0]) || !isFiniteNumber(value.anchor[1])) {
    return err('invalid_payload', ctx.messages.anchorNumbers(ctx.label));
  }
  return null;
}

function validateSource(value: Record<string, unknown>, ctx: ValidationContext): DomainResult<unknown> | null {
  if (value.source === undefined) return null;
  if (!isRecord(value.source)) {
    return err('invalid_payload', ctx.messages.sourceObject(ctx.label));
  }
  const width = value.source.width;
  const height = value.source.height;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
    return err('invalid_payload', ctx.messages.sourceRequired(ctx.label));
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return err('invalid_payload', ctx.messages.sourcePositive(ctx.label));
  }
  if (width > ctx.limits.maxTextureSize || height > ctx.limits.maxTextureSize) {
    return err('invalid_payload', ctx.messages.sourceExceedsMax(ctx.limits.maxTextureSize, ctx.label));
  }
  return null;
}

function validateTarget(value: Record<string, unknown>, ctx: ValidationContext): DomainResult<unknown> | null {
  if (value.target === undefined) return null;
  if (!isRecord(value.target)) {
    return err('invalid_payload', ctx.messages.targetObject(ctx.label));
  }
  const target = value.target as Record<string, unknown>;

  const cubeIdsValidation = validateNonEmptyStringArray(
    target.cubeIds,
    () => ctx.messages.targetCubeIdsRequired(ctx.label),
    () => ctx.messages.targetCubeIdsString(ctx.label)
  );
  if (cubeIdsValidation) return cubeIdsValidation;

  const cubeNamesValidation = validateNonEmptyStringArray(
    target.cubeNames,
    () => ctx.messages.targetCubeNamesRequired(ctx.label),
    () => ctx.messages.targetCubeNamesString(ctx.label)
  );
  if (cubeNamesValidation) return cubeNamesValidation;

  if (target.faces !== undefined) {
    if (!Array.isArray(target.faces) || target.faces.length === 0) {
      return err('invalid_payload', ctx.messages.targetFacesRequired(ctx.label));
    }
    const valid = target.faces.every(
      (face: unknown) => typeof face === 'string' && VALID_FACES.has(face)
    );
    if (!valid) {
      return err('invalid_payload', ctx.messages.targetFacesInvalid(ctx.label));
    }
  }
  return null;
}

const validateNonEmptyStringArray = (
  value: unknown,
  required: () => string,
  invalidType: () => string
): DomainResult<unknown> | null => {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) {
    return err('invalid_payload', required());
  }
  if (!value.every((entry: unknown) => typeof entry === 'string')) {
    return err('invalid_payload', invalidType());
  }
  return null;
};

const err = <T = never>(
  code: 'invalid_payload' | 'invalid_state',
  message: string
): DomainResult<T> => ({
  ok: false,
  error: { code, message }
});
