import type { CubeFaceDirection } from '../../ports/editor';
import type { PaintFacesPayload, PaintFacesResult } from '@ashfox/contracts/types/internal';
import type { TextureUsageResult } from '@ashfox/contracts/types/textureUsage';
import { isTextureOp, type TextureOpLike } from '../../domain/textureOps';
import { resolveUvPaintRects } from '../../domain/uv/paint';
import { validateUvPaintSpec } from '../../domain/uv/paintValidation';
import { guardUvUsage } from '../../domain/uv/guards';
import { collectSingleTarget } from '../../domain/uv/targets';
import { validateUvPaintSourceSize } from '../../domain/uv/paintSource';
import type { UvPaintSpec } from '../../domain/uv/paintSpec';
import { fail, ok, type UsecaseResult } from '../result';
import { toDomainSnapshot, toDomainTextureUsage } from '../domainMappers';
import type { TextureToolContext } from './context';
import { uvGuardMessages, uvPaintMessages, uvPaintSourceMessages } from './context';
import {
  doesBoundsIntersectCanvas,
  doesBoundsIntersectRects,
  getRectSpan,
  getTextureOpBounds,
  mergeRects,
  type Rect
} from './paintFacesPixels';
import { TEXTURE_FACES_OP_OUTSIDE_SOURCE, TEXTURE_FACES_OP_OUTSIDE_TARGET, TEXTURE_FACES_SIZE_REQUIRED, TEXTURE_FACES_TEXTURE_COORDS_SIZE_MISMATCH, TEXTURE_FACES_TEXTURE_COORDS_SIZE_REQUIRED, TEXTURE_OP_INVALID, TEXTURE_RENDERER_NO_IMAGE, TEXTURE_RENDERER_UNAVAILABLE } from '../../shared/messages';
import type { TextureBackup } from './paintFacesRecovery';

export type PaintFacesPassParams = {
  ctx: TextureToolContext;
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>;
  payload: PaintFacesPayload;
  coordSpace: 'face' | 'texture';
  normalizedTarget: {
    cubeId?: string;
    cubeName?: string;
    faces: CubeFaceDirection[];
  };
  resolvedTexture: {
    id?: string;
    name: string;
    width?: number;
    height?: number;
  };
  usageRaw: TextureUsageResult;
  uvUsageId?: string;
  recoveryAttempts: NonNullable<PaintFacesResult['recovery']>['attempts'];
  backup: TextureBackup | null;
};

export type PaintFacesPreflight = {
  mapping: 'stretch' | 'tile';
  op: TextureOpLike;
  rects: Rect[];
  faceBounds: Rect;
  textureWidth: number;
  textureHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  uvPaintTarget: UvPaintSpec;
  limits: TextureToolContext['capabilities']['limits'];
  readPixels: Uint8ClampedArray;
};

type PaintFacesTextureSource = {
  image: CanvasImageSource;
  textureWidth: number;
  textureHeight: number;
};

type PaintFacesUvTarget = {
  op: TextureOpLike;
  mapping: 'stretch' | 'tile';
  uvPaintTarget: UvPaintSpec;
  rects: Rect[];
  faceBounds: Rect;
};

type PaintFacesSourceSize = {
  sourceWidth: number;
  sourceHeight: number;
};

export const preparePaintFacesPreflight = (
  params: PaintFacesPassParams
): UsecaseResult<PaintFacesPreflight> => {
  const usage = toDomainTextureUsage(params.usageRaw);
  const domainSnapshot = toDomainSnapshot(params.ctx.getSnapshot());
  const textureResolution = params.ctx.editor.getProjectTextureResolution() ?? undefined;

  const usageGuardRes = guardPaintFacesUsage(params, usage, domainSnapshot.cubes, textureResolution);
  if (!usageGuardRes.ok) return fail(usageGuardRes.error);

  const textureSourceRes = resolvePaintFacesTextureSource(params, textureResolution);
  if (!textureSourceRes.ok) return fail(textureSourceRes.error);

  const uvTargetRes = resolvePaintFacesUvTarget(params, usage);
  if (!uvTargetRes.ok) return fail(uvTargetRes.error);

  const sourceSizeRes = resolvePaintFacesSourceSize(params, textureSourceRes.value, uvTargetRes.value.faceBounds);
  if (!sourceSizeRes.ok) return fail(sourceSizeRes.error);

  const boundsRes = validatePaintFacesOpBounds(params, uvTargetRes.value, sourceSizeRes.value);
  if (!boundsRes.ok) return fail(boundsRes.error);

  const readPixelsRes = readPaintFacesPixels(params, textureSourceRes.value);
  if (!readPixelsRes.ok) return fail(readPixelsRes.error);

  return ok({
    mapping: uvTargetRes.value.mapping,
    op: uvTargetRes.value.op,
    rects: uvTargetRes.value.rects,
    faceBounds: uvTargetRes.value.faceBounds,
    textureWidth: textureSourceRes.value.textureWidth,
    textureHeight: textureSourceRes.value.textureHeight,
    sourceWidth: sourceSizeRes.value.sourceWidth,
    sourceHeight: sourceSizeRes.value.sourceHeight,
    uvPaintTarget: uvTargetRes.value.uvPaintTarget,
    limits: params.ctx.capabilities.limits,
    readPixels: readPixelsRes.value
  });
};

const guardPaintFacesUsage = (
  params: PaintFacesPassParams,
  usage: ReturnType<typeof toDomainTextureUsage>,
  cubes: ReturnType<typeof toDomainSnapshot>['cubes'],
  textureResolution: { width: number; height: number } | undefined
): UsecaseResult<void> => {
  if (!params.uvUsageId) return ok(undefined);
  const guardErr = guardUvUsage({
    usage,
    cubes,
    expectedUsageId: params.uvUsageId,
    resolution: textureResolution,
    policy: params.ctx.getUvPolicyConfig(),
    targets: collectSingleTarget({ id: params.resolvedTexture.id, name: params.resolvedTexture.name }),
    messages: uvGuardMessages
  });
  if (guardErr) return fail(guardErr);
  return ok(undefined);
};

const resolvePaintFacesTextureSource = (
  params: PaintFacesPassParams,
  textureResolution: { width: number; height: number } | undefined
): UsecaseResult<PaintFacesTextureSource> => {
  const textureReadRes = params.ctx.editor.readTexture({
    id: params.resolvedTexture.id,
    name: params.resolvedTexture.name
  });
  if (textureReadRes.error || !textureReadRes.result || !textureReadRes.result.image) {
    return fail(textureReadRes.error ?? { code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });
  }
  const textureWidth =
    textureReadRes.result.width ?? params.resolvedTexture.width ?? textureResolution?.width ?? undefined;
  const textureHeight =
    textureReadRes.result.height ?? params.resolvedTexture.height ?? textureResolution?.height ?? undefined;
  if (!textureWidth || !textureHeight) {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_SIZE_REQUIRED });
  }
  return ok({
    image: textureReadRes.result.image,
    textureWidth,
    textureHeight
  });
};

const resolvePaintFacesUvTarget = (
  params: PaintFacesPassParams,
  usage: ReturnType<typeof toDomainTextureUsage>
): UsecaseResult<PaintFacesUvTarget> => {
  if (!isTextureOp(params.payload.op)) {
    return fail({ code: 'invalid_payload', message: TEXTURE_OP_INVALID(params.resolvedTexture.name) });
  }
  const mapping = params.payload.mapping ?? 'stretch';
  const uvPaintTarget: UvPaintSpec = {
    scope: 'rects',
    mapping,
    target: {
      cubeIds: params.normalizedTarget.cubeId ? [params.normalizedTarget.cubeId] : undefined,
      cubeNames: params.normalizedTarget.cubeName ? [params.normalizedTarget.cubeName] : undefined,
      faces: params.normalizedTarget.faces
    }
  };
  const targetValidation = validateUvPaintSpec(
    uvPaintTarget,
    params.ctx.capabilities.limits,
    params.resolvedTexture.name,
    uvPaintMessages
  );
  if (!targetValidation.ok) return fail(targetValidation.error);
  const rectRes = resolveUvPaintRects(
    { id: params.resolvedTexture.id, name: params.resolvedTexture.name, uvPaint: uvPaintTarget },
    usage,
    uvPaintMessages
  );
  if (!rectRes.ok) return fail(rectRes.error);
  const faceBounds = mergeRects(rectRes.data.rects);
  if (!faceBounds) {
    return fail({
      code: 'invalid_state',
      message: uvPaintMessages.noBounds(params.resolvedTexture.name),
      details: { reason: 'no_bounds' }
    });
  }
  return ok({
    op: params.payload.op,
    mapping,
    uvPaintTarget,
    rects: rectRes.data.rects,
    faceBounds
  });
};

const resolvePaintFacesSourceSize = (
  params: PaintFacesPassParams,
  textureSource: PaintFacesTextureSource,
  faceBounds: Rect
): UsecaseResult<PaintFacesSourceSize> => {
  const faceSourceWidth = getRectSpan(faceBounds.x1, faceBounds.x2);
  const faceSourceHeight = getRectSpan(faceBounds.y1, faceBounds.y2);
  let sourceWidth = Number(params.payload.width ?? faceSourceWidth);
  let sourceHeight = Number(params.payload.height ?? faceSourceHeight);

  if (
    params.coordSpace === 'texture' &&
    (params.payload.width === undefined || params.payload.height === undefined)
  ) {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_TEXTURE_COORDS_SIZE_REQUIRED });
  }

  const sourceRes = validateUvPaintSourceSize(
    sourceWidth,
    sourceHeight,
    params.ctx.capabilities.limits,
    params.resolvedTexture.name,
    { requireInteger: true },
    uvPaintSourceMessages
  );
  if (!sourceRes.ok) {
    const reason = sourceRes.error.details?.reason;
    if (reason === 'exceeds_max') {
      return fail({
        ...sourceRes.error,
        fix: `Use width/height <= ${params.ctx.capabilities.limits.maxTextureSize}.`,
        details: {
          ...(sourceRes.error.details ?? {}),
          maxSize: params.ctx.capabilities.limits.maxTextureSize
        }
      });
    }
    return fail(sourceRes.error);
  }

  sourceWidth = Math.trunc(sourceWidth);
  sourceHeight = Math.trunc(sourceHeight);
  if (
    params.coordSpace === 'texture' &&
    (sourceWidth !== textureSource.textureWidth || sourceHeight !== textureSource.textureHeight)
  ) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_FACES_TEXTURE_COORDS_SIZE_MISMATCH(
        textureSource.textureWidth,
        textureSource.textureHeight,
        sourceWidth,
        sourceHeight
      )
    });
  }

  return ok({ sourceWidth, sourceHeight });
};

const validatePaintFacesOpBounds = (
  params: PaintFacesPassParams,
  uvTarget: Pick<PaintFacesUvTarget, 'op' | 'rects' | 'faceBounds'>,
  sourceSize: PaintFacesSourceSize
): UsecaseResult<void> => {
  const opBounds = getTextureOpBounds(uvTarget.op);
  if (!doesBoundsIntersectCanvas(opBounds, sourceSize.sourceWidth, sourceSize.sourceHeight)) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_FACES_OP_OUTSIDE_SOURCE(params.coordSpace, sourceSize.sourceWidth, sourceSize.sourceHeight),
      details: {
        coordSpace: params.coordSpace,
        sourceWidth: sourceSize.sourceWidth,
        sourceHeight: sourceSize.sourceHeight,
        opBounds
      }
    });
  }
  if (params.coordSpace === 'texture' && !doesBoundsIntersectRects(opBounds, uvTarget.rects)) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_FACES_OP_OUTSIDE_TARGET,
      details: {
        coordSpace: params.coordSpace,
        opBounds,
        faceUv: [uvTarget.faceBounds.x1, uvTarget.faceBounds.y1, uvTarget.faceBounds.x2, uvTarget.faceBounds.y2]
      }
    });
  }
  return ok(undefined);
};

const readPaintFacesPixels = (
  params: PaintFacesPassParams,
  textureSource: PaintFacesTextureSource
): UsecaseResult<Uint8ClampedArray> => {
  const readPixels = params.textureRenderer.readPixels?.({
    image: textureSource.image,
    width: textureSource.textureWidth,
    height: textureSource.textureHeight
  });
  if (!readPixels || readPixels.error || !readPixels.result) {
    return fail(readPixels?.error ?? { code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  return ok(readPixels.result.data);
};
