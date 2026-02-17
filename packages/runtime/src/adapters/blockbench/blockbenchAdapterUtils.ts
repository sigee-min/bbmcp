import type { ToolError } from '@ashfox/contracts/types/internal';
import type {
  CubeConstructor,
  GroupConstructor,
  OutlinerApi,
  TextureConstructor
} from '../../types/blockbench';
import {
  ADAPTER_CUBE_API_UNAVAILABLE,
  ADAPTER_GROUP_API_UNAVAILABLE,
  ADAPTER_TEXTURE_API_UNAVAILABLE
} from '../../shared/messages';
import { readGlobals } from './blockbenchUtils';

export const getTextureApi = (): { TextureCtor: TextureConstructor } | { error: ToolError } => {
  const TextureCtor = readGlobals().Texture;
  if (!TextureCtor) {
    return { error: { code: 'invalid_state', message: ADAPTER_TEXTURE_API_UNAVAILABLE } };
  }
  return { TextureCtor };
};

export const getGroupApi = (): { GroupCtor: GroupConstructor; outliner: OutlinerApi | undefined } | { error: ToolError } => {
  const globals = readGlobals();
  const GroupCtor = globals.Group;
  const outliner = globals.Outliner;
  if (!GroupCtor) {
    return { error: { code: 'invalid_state', message: ADAPTER_GROUP_API_UNAVAILABLE } };
  }
  return { GroupCtor, outliner };
};

export const getCubeApi = (): { CubeCtor: CubeConstructor; outliner: OutlinerApi | undefined } | { error: ToolError } => {
  const globals = readGlobals();
  const CubeCtor = globals.Cube;
  const outliner = globals.Outliner;
  if (!CubeCtor) {
    return { error: { code: 'invalid_state', message: ADAPTER_CUBE_API_UNAVAILABLE } };
  }
  return { CubeCtor, outliner };
};
