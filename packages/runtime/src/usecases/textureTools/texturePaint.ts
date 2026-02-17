import type { PaintTexturePayload, PaintTextureResult } from '@ashfox/contracts/types/internal';
import { MAX_TEXTURE_OPS, isTextureOp } from '../../domain/textureOps';
import { applyTextureOps, fillPixels, parseHexColor } from '../../domain/texturePaint';
import { resolveUvPaintRects } from '../../domain/uv/paint';
import { validateUvPaintSpec } from '../../domain/uv/paintValidation';
import { guardUvUsage } from '../../domain/uv/guards';
import { collectSingleTarget } from '../../domain/uv/targets';
import { requireUvUsageId } from '../../domain/uv/usageId';
import { validateUvPaintSourceSize } from '../../domain/uv/paintSource';
import { checkDimensions, mapDimensionError } from '../../domain/dimensions';
import { toDomainSnapshot, toDomainTextureUsage } from '../domainMappers';
import { resolveTextureTarget } from '../targetResolvers';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import {
  DIMENSION_INTEGER_MESSAGE,
  DIMENSION_POSITIVE_MESSAGE,
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_OP_INVALID,
  TEXTURE_OPS_TOO_MANY,
  TEXTURE_PAINT_MODE_INVALID,
  TEXTURE_PAINT_NAME_REQUIRED,
  TEXTURE_PAINT_TARGET_REQUIRED,
  TEXTURE_PAINT_UV_USAGE_REQUIRED,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX,
  TEXTURE_RENDERER_UNAVAILABLE,
  TEXTURE_RENDERER_NO_IMAGE,
  TEXTURE_OP_COLOR_INVALID,
  TEXTURE_OP_LINEWIDTH_INVALID
} from '../../shared/messages';
import { fail, ok, type UsecaseResult } from '../result';
import type { TextureToolContext } from './context';
import { uvGuardMessages, uvPaintMessages, uvPaintPixelMessages, uvPaintSourceMessages } from './context';
import { applyUvPaintPixels } from '../../domain/uv/paintPixels';
import type { UvPaintSpec } from '../../domain/uv/paintSpec';
import type { UvPaintRect } from '../../domain/uv/paintTypes';

export const runPaintTexture = (
  ctx: TextureToolContext,
  payload: PaintTexturePayload
): UsecaseResult<PaintTextureResult> => {
  if (!ctx.textureRenderer) {
    return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  if (payload.mode && payload.mode !== 'create' && payload.mode !== 'update') {
    return fail({ code: 'invalid_payload', message: TEXTURE_PAINT_MODE_INVALID(payload.mode) });
  }
  const nameBlankErr = ensureNonBlankString(payload.name, 'name');
  if (nameBlankErr) return fail(nameBlankErr);
  const targetIdBlankErr = ensureNonBlankString(payload.targetId, 'targetId');
  if (targetIdBlankErr) return fail(targetIdBlankErr);
  const targetNameBlankErr = ensureNonBlankString(payload.targetName, 'targetName');
  if (targetNameBlankErr) return fail(targetNameBlankErr);
  const mode = payload.mode ?? (payload.targetId || payload.targetName ? 'update' : 'create');
  if (mode === 'create' && !payload.name) {
    return fail({ code: 'invalid_payload', message: TEXTURE_PAINT_NAME_REQUIRED });
  }
  if (mode === 'update' && !payload.targetId && !payload.targetName) {
    return fail({ code: 'invalid_payload', message: TEXTURE_PAINT_TARGET_REQUIRED });
  }
  const label = payload.targetName ?? payload.targetId ?? payload.name ?? 'texture';
  const width = Number(payload.width);
  const height = Number(payload.height);
  const maxSize = ctx.capabilities.limits.maxTextureSize;
  const sizeCheck = checkDimensions(width, height, { requireInteger: true, maxSize });
  if (!sizeCheck.ok) {
    const sizeMessage = mapDimensionError(sizeCheck, {
      nonPositive: (axis) => DIMENSION_POSITIVE_MESSAGE(axis, axis),
      nonInteger: (axis) => DIMENSION_INTEGER_MESSAGE(axis, axis),
      exceedsMax: (limit) => TEXTURE_PAINT_SIZE_EXCEEDS_MAX(limit || maxSize)
    });
    if (sizeCheck.reason === 'exceeds_max') {
      return fail({
        code: 'invalid_payload',
        message: sizeMessage ?? TEXTURE_PAINT_SIZE_EXCEEDS_MAX(maxSize),
        fix: TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX(maxSize),
        details: { width, height, maxSize }
      });
    }
    return fail({ code: 'invalid_payload', message: sizeMessage ?? DIMENSION_POSITIVE_MESSAGE('width/height') });
  }
  const uvPaintSpec: UvPaintSpec | undefined = payload.uvPaint;
  if (uvPaintSpec) {
    const uvPaintValidation = validateUvPaintSpec(uvPaintSpec, ctx.capabilities.limits, label, uvPaintMessages);
    if (!uvPaintValidation.ok) return fail(uvPaintValidation.error);
  }
  const ops = payload.ops ?? [];
  if (!Array.isArray(ops)) {
    return fail({ code: 'invalid_payload', message: TEXTURE_OP_INVALID(label) });
  }
  if (ops.length > MAX_TEXTURE_OPS) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_OPS_TOO_MANY(MAX_TEXTURE_OPS, label)
    });
  }
  for (const op of ops) {
    if (!isTextureOp(op)) {
      return fail({ code: 'invalid_payload', message: TEXTURE_OP_INVALID(label) });
    }
  }

  const snapshot = ctx.getSnapshot();
  let target: { id?: string; name: string } | null = null;
  if (mode === 'update') {
    const resolved = resolveTextureTarget(snapshot.textures, payload.targetId, payload.targetName, {
      required: { message: TEXTURE_PAINT_TARGET_REQUIRED }
    });
    if (resolved.error) return fail(resolved.error);
    target = resolved.target!;
  }
  if (mode === 'update' && payload.name && payload.name !== target?.name) {
    const conflict = snapshot.textures.some(
      (texture) => texture.name === payload.name && texture.id !== target?.id
    );
    if (conflict) return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
  }
  if (mode === 'create' && payload.name) {
    const conflict = snapshot.textures.some((texture) => texture.name === payload.name);
    if (conflict) return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
  }

  const resolvedLabel = target?.name ?? payload.name ?? payload.targetName ?? payload.targetId ?? label;
  const sourceWidth = Number(uvPaintSpec?.source?.width ?? width);
  const sourceHeight = Number(uvPaintSpec?.source?.height ?? height);
  const sourceRes = validateUvPaintSourceSize(
    sourceWidth,
    sourceHeight,
    ctx.capabilities.limits,
    resolvedLabel,
    { requireInteger: true },
    uvPaintSourceMessages
  );
  if (!sourceRes.ok) {
    const reason = sourceRes.error.details?.reason;
    if (reason === 'exceeds_max') {
      return fail({
        ...sourceRes.error,
        fix: `Use width/height <= ${maxSize}.`,
        details: { ...(sourceRes.error.details ?? {}), maxSize }
      });
    }
    return fail(sourceRes.error);
  }

  let rects: UvPaintRect[] | null = null;
  if (uvPaintSpec) {
    const usageIdRes = requireUvUsageId(payload.uvUsageId, { required: TEXTURE_PAINT_UV_USAGE_REQUIRED });
    if (!usageIdRes.ok) return fail(usageIdRes.error);
    const usageRes = ctx.editor.getTextureUsage({});
    if (usageRes.error) return fail(usageRes.error);
    const usageRaw = usageRes.result ?? { textures: [] };
    const usage = toDomainTextureUsage(usageRaw);
    const domainSnapshot = toDomainSnapshot(snapshot);
    const targets = collectSingleTarget({
      id: target?.id,
      name: target?.name ?? payload.name,
      targetId: payload.targetId,
      targetName: payload.targetName
    });
    const resolution = ctx.editor.getProjectTextureResolution() ?? { width, height };
    const guardError = guardUvUsage({
      usage,
      cubes: domainSnapshot.cubes,
      expectedUsageId: usageIdRes.data,
      resolution,
      policy: ctx.getUvPolicyConfig(),
      targets,
      messages: uvGuardMessages
    });
    if (guardError) return fail(guardError);
    const rectRes = resolveUvPaintRects(
      { id: target?.id, name: target?.name ?? payload.name, targetId: payload.targetId, targetName: payload.targetName, uvPaint: uvPaintSpec },
      usage,
      uvPaintMessages
    );
    if (!rectRes.ok) return fail(rectRes.error);
    rects = rectRes.data.rects;
  }

  const sourceData = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
  if (payload.background) {
    const bgColor = parseHexColor(payload.background);
    if (!bgColor) {
      return fail({ code: 'invalid_payload', message: TEXTURE_OP_COLOR_INVALID(resolvedLabel) });
    }
    fillPixels(sourceData, sourceWidth, sourceHeight, bgColor);
  }
  if (ops.length > 0) {
    const res = applyTextureOps(sourceData, sourceWidth, sourceHeight, ops, parseHexColor);
    if (!res.ok) {
      const reason =
        res.reason === 'invalid_line_width'
          ? TEXTURE_OP_LINEWIDTH_INVALID(resolvedLabel)
          : res.reason === 'invalid_op'
            ? TEXTURE_OP_INVALID(resolvedLabel)
            : TEXTURE_OP_COLOR_INVALID(resolvedLabel);
      return fail({ code: 'invalid_payload', message: reason, details: { opIndex: res.opIndex } });
    }
  }

  let targetPixels: Uint8ClampedArray = sourceData;
  if (uvPaintSpec) {
    const padding = uvPaintSpec.padding ?? 0;
    const anchor = uvPaintSpec.anchor ?? [0, 0];
    const paintRes = applyUvPaintPixels({
      source: { width: sourceWidth, height: sourceHeight, data: sourceData },
      target: { width, height },
      config: {
        rects: rects ?? [],
        mapping: uvPaintSpec.mapping ?? 'stretch',
        padding,
        anchor
      },
      label: resolvedLabel,
      messages: uvPaintPixelMessages
    });
    if (!paintRes.ok) return fail(paintRes.error);
    targetPixels = paintRes.data.data;
  }

  const renderRes = ctx.textureRenderer.renderPixels({ width, height, data: targetPixels });
  if (renderRes.error) return fail(renderRes.error);
  if (!renderRes.result) {
    return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });
  }
  const upsert =
    mode === 'update'
      ? ctx.updateTexture({
          id: target?.id,
          name: target?.name,
          newName: payload.name,
          image: renderRes.result.image,
          width,
          height,
          ifRevision: payload.ifRevision
        })
      : ctx.importTexture({
          name: payload.name!,
          image: renderRes.result.image,
          width,
          height,
          ifRevision: payload.ifRevision
        });
  if (!upsert.ok) return fail(upsert.error);
  return ok({ width, height, uvUsageId: payload.uvUsageId, opsApplied: ops.length });
};
