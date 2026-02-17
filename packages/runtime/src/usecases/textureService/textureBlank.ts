import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { TextureRendererPort } from '../../ports/textureRenderer';
import { checkDimensions, mapDimensionError } from '../../domain/dimensions';
import { fillPixels, parseHexColor } from '../../domain/texturePaint';
import {
  DIMENSION_INTEGER_MESSAGE,
  DIMENSION_POSITIVE_MESSAGE,
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_NAME_REQUIRED,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX,
  TEXTURE_RENDERER_NO_IMAGE,
  TEXTURE_RENDERER_UNAVAILABLE
} from '../../shared/messages';
import { withActiveOnly } from '../guards';
import { fail, ok, type UsecaseResult } from '../result';

export type CreateBlankTexturePayload = {
  name: string;
  width?: number;
  height?: number;
  background?: string;
  ifRevision?: string;
  allowExisting?: boolean;
};

export type CreateBlankTextureContext = {
  ensureActive: () => ToolError | null;
  capabilities: Capabilities;
  editor: Pick<EditorPort, 'listTextures' | 'getProjectTextureResolution'>;
  textureRenderer?: TextureRendererPort;
  importTexture: (payload: {
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  }) => UsecaseResult<{ id: string; name: string }>;
};

export const runCreateBlankTexture = (
  ctx: CreateBlankTextureContext,
  payload: CreateBlankTexturePayload
): UsecaseResult<{ id: string; name: string; created: boolean }> =>
  withActiveOnly<{ id: string; name: string; created: boolean }>(ctx.ensureActive, () => {
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: TEXTURE_NAME_REQUIRED });
    }
    if (!ctx.textureRenderer) {
      return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_UNAVAILABLE });
    }

    const existing = ctx.editor.listTextures().find((tex) => tex.name === payload.name);
    if (existing && payload.allowExisting) {
      return ok({ id: existing.id ?? payload.name, name: payload.name, created: false });
    }
    if (existing && !payload.allowExisting) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
    }

    const resolution = ctx.editor.getProjectTextureResolution();
    const width = Number(payload.width ?? resolution?.width ?? 16);
    const height = Number(payload.height ?? resolution?.height ?? 16);
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

    const data = new Uint8ClampedArray(width * height * 4);
    if (payload.background) {
      const bg = parseHexColor(payload.background);
      if (bg) fillPixels(data, width, height, bg);
    }
    const renderRes = ctx.textureRenderer.renderPixels({ width, height, data });
    if (renderRes.error) return fail(renderRes.error);
    if (!renderRes.result) {
      return fail({ code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });
    }

    const created = ctx.importTexture({
      name: payload.name,
      image: renderRes.result.image,
      width,
      height,
      ifRevision: payload.ifRevision
    });
    if (!created.ok) return fail(created.error);
    return ok({ id: created.value.id, name: created.value.name, created: true });
  });
