import type { PaintFacesResult } from '@ashfox/contracts/types/internal';
import { applyTextureOps, parseHexColor } from '../../domain/texturePaint';
import { applyUvPaintPixels } from '../../domain/uv/paintPixels';
import { validateUvPaintSpec } from '../../domain/uv/paintValidation';
import type { UvPaintSpec } from '../../domain/uv/paintSpec';
import { fail, ok, type UsecaseResult } from '../result';
import { uvPaintMessages, uvPaintPixelMessages } from './context';
import {
  countChangedPixels,
  overlayPatchRects,
  overlayTextureSpaceRects
} from './paintFacesPixels';
import { maybeRollbackTextureLoss } from './paintFacesRecovery';
import {
  preparePaintFacesPreflight,
  type PaintFacesPassParams,
  type PaintFacesPreflight
} from './paintFacesStages';
import {
  TEXTURE_OP_COLOR_INVALID,
  TEXTURE_OP_INVALID,
  TEXTURE_OP_LINEWIDTH_INVALID,
  TEXTURE_RENDERER_NO_IMAGE
} from '../../shared/messages';
import type { TextureOpLike } from '../../domain/textureOps';

type PaintFacesExecution = {
  pixels: Uint8ClampedArray;
  changedPixels: number;
};

type CoordSpaceExecutor = (params: {
  preflight: PaintFacesPreflight;
  resolvedTextureName: string;
}) => UsecaseResult<PaintFacesExecution>;

const coordSpaceExecutors: Record<'face' | 'texture', CoordSpaceExecutor> = {
  face: ({ preflight, resolvedTextureName }) => {
    const pixels = new Uint8ClampedArray(preflight.readPixels);
    const before = new Uint8ClampedArray(pixels);
    const sourceData = new Uint8ClampedArray(preflight.sourceWidth * preflight.sourceHeight * 4);
    const applyRes = applySingleTextureOp(
      sourceData,
      preflight.sourceWidth,
      preflight.sourceHeight,
      preflight.op,
      resolvedTextureName
    );
    if (!applyRes.ok) return applyRes;

    const uvPaint: UvPaintSpec = {
      ...preflight.uvPaintTarget,
      source: { width: preflight.sourceWidth, height: preflight.sourceHeight }
    };
    const uvPaintValidation = validateUvPaintSpec(
      uvPaint,
      preflight.limits,
      resolvedTextureName,
      uvPaintMessages
    );
    if (!uvPaintValidation.ok) return fail(uvPaintValidation.error);

    const patchRes = applyUvPaintPixels({
      source: { width: preflight.sourceWidth, height: preflight.sourceHeight, data: sourceData },
      target: { width: preflight.textureWidth, height: preflight.textureHeight },
      config: { rects: preflight.rects, mapping: preflight.mapping, padding: 0, anchor: [0, 0] },
      label: resolvedTextureName,
      messages: uvPaintPixelMessages
    });
    if (!patchRes.ok) return fail(patchRes.error);

    overlayPatchRects(pixels, patchRes.data.data, patchRes.data.rects, preflight.textureWidth, preflight.textureHeight);
    return ok({
      pixels,
      changedPixels: countChangedPixels(before, pixels)
    });
  },
  texture: ({ preflight, resolvedTextureName }) => {
    const pixels = new Uint8ClampedArray(preflight.readPixels);
    const before = new Uint8ClampedArray(pixels);
    const textureSpace = new Uint8ClampedArray(pixels);
    const applyRes = applySingleTextureOp(
      textureSpace,
      preflight.sourceWidth,
      preflight.sourceHeight,
      preflight.op,
      resolvedTextureName
    );
    if (!applyRes.ok) return applyRes;

    overlayTextureSpaceRects(
      pixels,
      textureSpace,
      preflight.rects,
      preflight.textureWidth,
      preflight.textureHeight
    );
    return ok({
      pixels,
      changedPixels: countChangedPixels(before, pixels)
    });
  }
};

export const runPaintFacesPass = (params: PaintFacesPassParams): UsecaseResult<PaintFacesResult> => {
  const preflight = preparePaintFacesPreflight(params);
  if (!preflight.ok) return fail(preflight.error);

  const execute = coordSpaceExecutors[params.coordSpace];
  const execution = execute({
    preflight: preflight.value,
    resolvedTextureName: params.resolvedTexture.name
  });
  if (!execution.ok) return fail(execution.error);

  return finalizePaintFacesPass(params, preflight.value, execution.value);
};

const finalizePaintFacesPass = (
  params: PaintFacesPassParams,
  preflight: PaintFacesPreflight,
  execution: PaintFacesExecution
): UsecaseResult<PaintFacesResult> => {
  const renderRes = params.textureRenderer.renderPixels({
    width: preflight.textureWidth,
    height: preflight.textureHeight,
    data: execution.pixels
  });
  if (renderRes.error) return fail(renderRes.error);
  if (!renderRes.result) return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });

  const updateRes = params.ctx.updateTexture({
    id: params.resolvedTexture.id,
    name: params.resolvedTexture.name,
    image: renderRes.result.image,
    width: preflight.textureWidth,
    height: preflight.textureHeight,
    ifRevision: params.payload.ifRevision
  });
  if (!updateRes.ok && updateRes.error.code !== 'no_change') return fail(updateRes.error);

  const rollbackError = maybeRollbackTextureLoss({
    ctx: params.ctx,
    textureRenderer: params.textureRenderer,
    texture: {
      id: params.resolvedTexture.id,
      name: params.resolvedTexture.name,
      width: preflight.textureWidth,
      height: preflight.textureHeight
    },
    ifRevision: params.payload.ifRevision,
    recoveryAttempts: params.recoveryAttempts.length,
    backup: params.backup
  });
  if (rollbackError) return fail(rollbackError);

  const result: PaintFacesResult = {
    textureName: params.resolvedTexture.name,
    width: preflight.textureWidth,
    height: preflight.textureHeight,
    targets: 1,
    facesApplied: preflight.rects.length,
    opsApplied: 1,
    changedPixels: execution.changedPixels,
    resolvedSource: {
      coordSpace: params.coordSpace,
      width: preflight.sourceWidth,
      height: preflight.sourceHeight,
      faceUv: [preflight.faceBounds.x1, preflight.faceBounds.y1, preflight.faceBounds.x2, preflight.faceBounds.y2]
    }
  };
  if (params.recoveryAttempts.length > 0) {
    result.recovery = {
      applied: true,
      attempts: params.recoveryAttempts
    };
  }
  return ok(result);
};

const applySingleTextureOp = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  op: TextureOpLike,
  textureLabel: string
): UsecaseResult<void> => {
  const res = applyTextureOps(pixels, width, height, [op], parseHexColor);
  if (!res.ok) {
    const reason = mapTextureOpFailureReason(res.reason, textureLabel);
    return fail({ code: 'invalid_payload', message: reason, details: { opIndex: res.opIndex } });
  }
  return ok(undefined);
};

const mapTextureOpFailureReason = (
  reason: 'invalid_color' | 'invalid_line_width' | 'invalid_op',
  textureLabel: string
): string => {
  switch (reason) {
    case 'invalid_line_width':
      return TEXTURE_OP_LINEWIDTH_INVALID(textureLabel);
    case 'invalid_op':
      return TEXTURE_OP_INVALID(textureLabel);
    default:
      return TEXTURE_OP_COLOR_INVALID(textureLabel);
  }
};
