import type { AnimationClip, OutlinerNode, TextureInstance } from '../../../types/blockbench';

export const readNodeId = (node: OutlinerNode | null | undefined): string | null => {
  if (!node) return null;
  const raw = node.ashfoxId ?? node.uuid ?? node.id ?? node.uid ?? node._uuid ?? null;
  return raw ? String(raw) : null;
};

export const readTextureId = (tex: TextureInstance | null | undefined): string | null => {
  if (!tex) return null;
  const raw = tex.ashfoxId ?? tex.uuid ?? tex.id ?? tex.uid ?? tex._uuid ?? null;
  return raw ? String(raw) : null;
};

export const readTextureAliases = (tex: TextureInstance | null | undefined): string[] => {
  if (!tex) return [];
  const candidates: Array<string | null | undefined> = [tex.ashfoxId, tex.uuid, tex.id, tex.uid, tex._uuid];
  const unique = new Set<string>();
  candidates.forEach((value) => {
    if (!value) return;
    const label = String(value).trim();
    if (!label) return;
    unique.add(label);
  });
  return Array.from(unique);
};

export const readAnimationId = (anim: AnimationClip | null | undefined): string | null => {
  if (!anim) return null;
  const raw = anim.ashfoxId ?? anim.uuid ?? anim.id ?? anim.uid ?? anim._uuid ?? null;
  return raw ? String(raw) : null;
};

