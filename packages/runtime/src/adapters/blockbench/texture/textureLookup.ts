import type { TextureConstructor, TextureInstance } from '../../../types/blockbench';
import type { TextureStat } from '../../../ports/editor';
import { getTextureApi } from '../blockbenchAdapterUtils';
import { readTextureId } from '../utils/ids';
import { readTextureSize } from '../utils/texture';

const getAllTextures = (): TextureInstance[] => {
  const api = getTextureApi();
  if ('error' in api) return [];
  const TextureCtor = api.TextureCtor as TextureConstructor;
  return Array.isArray(TextureCtor.all) ? TextureCtor.all : [];
};

export const findTextureRef = (name?: string, id?: string): TextureInstance | null => {
  const textures = getAllTextures();
  if (id) {
    const byId = textures.find((tex) => readTextureId(tex) === id);
    if (byId) return byId;
  }
  if (name) return textures.find((tex) => tex?.name === name || tex?.id === name) ?? null;
  return null;
};

export const listTextureStats = (): TextureStat[] =>
  getAllTextures().map((tex) => {
    const size = readTextureSize(tex);
    return {
      id: readTextureId(tex),
      name: tex?.name ?? tex?.id ?? 'texture',
      width: size.width ?? 0,
      height: size.height ?? 0,
      path: tex?.path ?? tex?.source
    };
  });
