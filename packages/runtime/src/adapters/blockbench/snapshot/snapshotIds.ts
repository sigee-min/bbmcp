import type { AnimationClip, OutlinerNode, TextureInstance } from '../../../types/blockbench';
import { readAnimationId as readAnimationIdNullable, readNodeId as readNodeIdNullable, readTextureId as readTextureIdNullable } from '../blockbenchUtils';

export const readNodeId = (node: OutlinerNode | null | undefined): string | undefined => {
  const id = readNodeIdNullable(node);
  return id ?? undefined;
};

export const readTextureId = (tex: TextureInstance | null | undefined): string | undefined => {
  const id = readTextureIdNullable(tex);
  return id ?? undefined;
};

export const readAnimationId = (anim: AnimationClip | null | undefined): string | undefined => {
  const id = readAnimationIdNullable(anim);
  return id ?? undefined;
};
