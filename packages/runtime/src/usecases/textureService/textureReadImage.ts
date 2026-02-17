import type { ReadTextureResult } from '@ashfox/contracts/types/internal';
import type { TextureSource } from '../../ports/editor';
import {
  estimateDataUriByteLength,
  hashCanvasImage,
  normalizeTextureDataUri,
  parseDataUriMimeType
} from '../../shared/textureData';
import { TEXTURE_DATA_UNAVAILABLE } from '../../shared/messages';
import { fail, ok, type UsecaseResult } from '../result';

export type PreparedTextureReadImage = {
  result: ReadTextureResult;
  dataUri: string;
  mimeType: string;
  width?: number;
  height?: number;
};

export const prepareTextureReadImage = (source: TextureSource): UsecaseResult<PreparedTextureReadImage> => {
  const dataUri = normalizeTextureDataUri(source.dataUri);
  if (!dataUri) {
    return fail({ code: 'invalid_state', message: TEXTURE_DATA_UNAVAILABLE });
  }

  const mimeType = parseDataUriMimeType(dataUri) ?? 'image/png';
  const byteLength = estimateDataUriByteLength(dataUri) ?? undefined;
  const hash = hashCanvasImage(source.image) ?? undefined;

  return ok({
    dataUri,
    mimeType,
    width: source.width,
    height: source.height,
    result: {
      texture: {
        id: source.id,
        name: source.name,
        mimeType,
        dataUri,
        width: source.width,
        height: source.height,
        byteLength,
        hash
      }
    }
  });
};

export const withSavedTextureResult = (
  prepared: PreparedTextureReadImage,
  saved: { path: string; byteLength: number }
): ReadTextureResult => ({
  ...prepared.result,
  saved: {
    texture: {
      path: saved.path,
      mime: prepared.mimeType,
      byteLength: saved.byteLength,
      width: prepared.width,
      height: prepared.height
    }
  }
});
