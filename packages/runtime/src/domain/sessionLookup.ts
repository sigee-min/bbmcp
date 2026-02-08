import { SessionState } from '../session';

export const resolveBoneNameById = (bones: SessionState['bones'], id: string): string | null => {
  const match = bones.find((bone) => bone.id === id);
  return match?.name ?? null;
};

type TargetNamed = { id?: string | null; name: string };

export const resolveTargetByIdOrName = <T extends TargetNamed>(items: T[], id?: string, name?: string): T | null => {
  if (id) {
    return items.find((item) => item.id === id) ?? null;
  }
  if (name) {
    return items.find((item) => item.name === name) ?? null;
  }
  return null;
};

export const resolveTargetLabel = (id?: string, name?: string): string => id ?? name ?? 'unknown';

export const collectDescendantBones = (bones: SessionState['bones'], rootName: string): string[] => {
  const childrenMap = new Map<string, string[]>();
  bones.forEach((bone) => {
    if (!bone.parent) return;
    const list = childrenMap.get(bone.parent) ?? [];
    list.push(bone.name);
    childrenMap.set(bone.parent, list);
  });
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [...(childrenMap.get(rootName) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
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



