import { SessionState } from '../session';

export const resolveBoneNameById = (bones: SessionState['bones'], id: string): string | null => {
  const match = bones.find((bone) => bone.id === id);
  return match?.name ?? null;
};

export const resolveBoneTarget = (bones: SessionState['bones'], id?: string, name?: string) => {
  if (id) {
    return bones.find((bone) => bone.id === id) ?? null;
  }
  if (name) {
    return bones.find((bone) => bone.name === name) ?? null;
  }
  return null;
};

export const resolveCubeTarget = (cubes: SessionState['cubes'], id?: string, name?: string) => {
  if (id) {
    return cubes.find((cube) => cube.id === id) ?? null;
  }
  if (name) {
    return cubes.find((cube) => cube.name === name) ?? null;
  }
  return null;
};

export const resolveTextureTarget = (textures: SessionState['textures'], id?: string, name?: string) => {
  if (id) {
    return textures.find((tex) => tex.id === id) ?? null;
  }
  if (name) {
    return textures.find((tex) => tex.name === name) ?? null;
  }
  return null;
};

export const resolveAnimationTarget = (animations: SessionState['animations'], id?: string, name?: string) => {
  if (id) {
    return animations.find((anim) => anim.id === id) ?? null;
  }
  if (name) {
    return animations.find((anim) => anim.name === name) ?? null;
  }
  return null;
};

export const collectDescendantBones = (bones: SessionState['bones'], rootName: string): string[] => {
  const childrenMap = new Map<string, string[]>();
  bones.forEach((bone) => {
    if (!bone.parent) return;
    const list = childrenMap.get(bone.parent) ?? [];
    list.push(bone.name);
    childrenMap.set(bone.parent, list);
  });
  const result: string[] = [];
  const queue = [...(childrenMap.get(rootName) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    result.push(next);
    const children = childrenMap.get(next);
    if (children && children.length > 0) {
      queue.push(...children);
    }
  }
  return result;
};

export const isDescendantBone = (bones: SessionState['bones'], rootName: string, candidateParent: string): boolean => {
  const descendants = collectDescendantBones(bones, rootName);
  return descendants.includes(candidateParent);
};
