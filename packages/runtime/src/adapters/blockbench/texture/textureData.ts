import type { TextureInstance } from '../../../types/blockbench';
import { normalizeTextureDataUri } from '../../../shared/textureData';
import { readGlobals } from '../utils/globals';

export const getTextureDataUri = (tex: TextureInstance): string | null => {
  if (!tex) return null;
  if (typeof tex.getDataUrl === 'function') {
    return tex.getDataUrl();
  }
  if (typeof tex.getBase64 === 'function') {
    const base64 = tex.getBase64();
    return base64 ? normalizeTextureDataUri(base64) : null;
  }
  if (typeof tex.toDataURL === 'function') {
    return tex.toDataURL('image/png');
  }
  const canvas = tex.canvas;
  if (canvas && typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL('image/png');
  }
  const img = tex.img;
  const doc = readGlobals().document;
  if (img && doc?.createElement) {
    const temp = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (!temp) return null;
    const width = img.naturalWidth ?? img.width ?? 0;
    const height = img.naturalHeight ?? img.height ?? 0;
    if (!width || !height) return null;
    temp.width = width;
    temp.height = height;
    const ctx = temp.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return temp.toDataURL('image/png');
  }
  return null;
};
