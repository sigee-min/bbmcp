import type { PaintFacesPayload } from '@ashfox/contracts/types/internal';
import { checkDimensions, mapDimensionError } from '../../domain/dimensions';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';
import { normalizeCubeFaces } from '../textureService/textureUsageUtils';
import { CUBE_FACE_DIRECTIONS } from '../../shared/toolConstants';
import {
  DIMENSION_INTEGER_MESSAGE,
  DIMENSION_POSITIVE_MESSAGE,
  TEXTURE_ASSIGN_FACES_INVALID,
  TEXTURE_FACES_TARGET_REQUIRED,
  TEXTURE_FACES_TARGET_SELECTOR_REQUIRED,
  TEXTURE_FACES_TEXTURE_REQUIRED,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX,
  TEXTURE_RENDERER_UNAVAILABLE
} from '../../shared/messages';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { fail, ok, type UsecaseResult } from '../result';
import type { TextureToolContext } from './context';

export type NormalizedPaintFaceTarget = {
  cubeId?: string;
  cubeName?: string;
  faces: NonNullable<ReturnType<typeof normalizeCubeFaces>>;
};

type SnapshotTexture = ReturnType<TextureToolContext['getSnapshot']>['textures'][number];

export const normalizePaintTarget = (
  target: PaintFacesPayload['target'] | undefined
): UsecaseResult<NormalizedPaintFaceTarget> => {
  if (!target || typeof target !== 'object') {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_TARGET_REQUIRED });
  }
  const idBlankErr = ensureNonBlankString(target.cubeId, 'cubeId');
  if (idBlankErr) return fail(idBlankErr);
  const nameBlankErr = ensureNonBlankString(target.cubeName, 'cubeName');
  if (nameBlankErr) return fail(nameBlankErr);
  if (!target.cubeId && !target.cubeName) {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_TARGET_SELECTOR_REQUIRED });
  }
  const faces = target.face === undefined ? [...CUBE_FACE_DIRECTIONS] : normalizeCubeFaces([target.face]);
  if (!faces || faces.length === 0) {
    return fail({ code: 'invalid_payload', message: TEXTURE_ASSIGN_FACES_INVALID });
  }
  return ok({
    cubeId: target.cubeId,
    cubeName: target.cubeName,
    faces
  });
};

export const resolveTextureForPaintFaces = (
  ctx: TextureToolContext,
  payload: PaintFacesPayload,
  snapshot: ReturnType<TextureToolContext['getSnapshot']>,
  textureId: string | undefined,
  textureName: string | undefined
): UsecaseResult<SnapshotTexture> => {
  const textures = snapshot.textures;
  const byId = textureId ? textures.find((tex) => tex.id === textureId) : undefined;
  const byName = textureName ? textures.find((tex) => tex.name === textureName) : undefined;
  if (byId && byName && byId.name !== byName.name) {
    return fail({
      code: 'invalid_payload',
      message: buildIdNameMismatchMessage({
        kind: 'Texture',
        plural: 'textures',
        idLabel: 'textureId',
        nameLabel: 'textureName',
        id: textureId as string,
        name: textureName as string
      })
    });
  }

  let resolvedTexture = byId ?? byName ?? null;
  if (!resolvedTexture) {
    if (!ctx.createBlankTexture) {
      return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_UNAVAILABLE });
    }
    const fallbackResolution = ctx.editor.getProjectTextureResolution() ?? { width: 16, height: 16 };
    const createWidth = Number(payload.width ?? fallbackResolution.width);
    const createHeight = Number(payload.height ?? fallbackResolution.height);
    const maxSize = ctx.capabilities.limits.maxTextureSize;
    const sizeCheck = checkDimensions(createWidth, createHeight, { requireInteger: true, maxSize });
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
          details: { width: createWidth, height: createHeight, maxSize }
        });
      }
      return fail({ code: 'invalid_payload', message: sizeMessage ?? DIMENSION_POSITIVE_MESSAGE('width/height') });
    }

    const created = ctx.createBlankTexture({
      name: textureName ?? 'texture',
      width: createWidth,
      height: createHeight,
      allowExisting: true
    });
    if (!created.ok) return fail(created.error);

    const refreshed = ctx.getSnapshot();
    const refreshedById = textureId ? refreshed.textures.find((tex) => tex.id === textureId) : undefined;
    const refreshedByName = textureName ? refreshed.textures.find((tex) => tex.name === textureName) : undefined;
    resolvedTexture = refreshedById ?? refreshedByName ?? null;
  }

  if (!resolvedTexture) {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_TEXTURE_REQUIRED });
  }
  return ok(resolvedTexture);
};
