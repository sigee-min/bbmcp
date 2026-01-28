import { Logger } from '../../logging';
import {
  AnimationClip,
  BlockbenchApi,
  OutlinerApi,
  OutlinerNode,
  TextureInstance,
  UnknownRecord,
  readBlockbenchGlobals
} from '../../types/blockbench';
import { errorMessage } from '../../logging';

export const readGlobals = readBlockbenchGlobals;

export const normalizeEditAspects = (aspects: UnknownRecord) => {
  const normalized = { ...aspects };
  const arrayKeys = ['elements', 'outliner', 'textures', 'animations', 'keyframes'];
  arrayKeys.forEach((key) => {
    if (normalized[key] === true) normalized[key] = [];
  });
  return normalized;
};

export const withUndo = (aspects: UnknownRecord, editName: string, fn: () => void) => {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const undo = globals.Undo;
  const normalized = normalizeEditAspects(aspects);
  if (undo?.initEdit && undo?.finishEdit) {
    undo.initEdit(normalized);
    fn();
    undo.finishEdit(editName);
    return;
  }
  if (typeof blockbench?.edit === 'function') {
    blockbench.edit(normalized, fn);
    return;
  }
  fn();
};

type Renamable = { name?: unknown; rename?: (name: string) => void };

export const renameEntity = (entity: Renamable, nextName: string): void => {
  if (!entity || typeof nextName !== 'string') return;
  if (typeof entity.rename === 'function') {
    entity.rename(nextName);
    return;
  }
  if (typeof entity.name !== 'undefined') {
    entity.name = nextName;
  }
};

type Removable = { remove?: () => void; delete?: () => void; dispose?: () => void };

export const removeEntity = (entity: Removable | null | undefined): boolean => {
  if (!entity) return false;
  if (typeof entity.remove === 'function') {
    entity.remove();
    return true;
  }
  if (typeof entity.delete === 'function') {
    entity.delete();
    return true;
  }
  if (typeof entity.dispose === 'function') {
    entity.dispose();
    return true;
  }
  return false;
};

type Extendable = { extend?: (patch: Record<string, unknown>) => void };

export const extendEntity = (entity: Extendable | null | undefined, patch: Record<string, unknown>): boolean => {
  if (!entity || !patch) return false;
  if (typeof entity.extend === 'function') {
    entity.extend(patch);
    return true;
  }
  return false;
};

type VisibilityTarget = { visibility?: boolean; visible?: boolean };

export const setVisibility = (target: VisibilityTarget | null | undefined, value: boolean | undefined): void => {
  if (!target || typeof value !== 'boolean') return;
  if (typeof target.visibility === 'boolean') {
    target.visibility = value;
    return;
  }
  if (typeof target.visible === 'boolean') {
    target.visible = value;
  }
};

export const readVisibility = (target: VisibilityTarget | null | undefined): boolean | undefined => {
  if (!target) return undefined;
  if (typeof target.visibility === 'boolean') return target.visibility;
  if (typeof target.visible === 'boolean') return target.visible;
  return undefined;
};

export const readNodeId = (node: OutlinerNode | null | undefined): string | null => {
  if (!node) return null;
  const raw = node.bbmcpId ?? node.uuid ?? node.id ?? node.uid ?? node._uuid ?? null;
  return raw ? String(raw) : null;
};

export const readTextureId = (tex: TextureInstance | null | undefined): string | null => {
  if (!tex) return null;
  const raw = tex.bbmcpId ?? tex.uuid ?? tex.id ?? tex.uid ?? tex._uuid ?? null;
  return raw ? String(raw) : null;
};

export const readTextureAliases = (tex: TextureInstance | null | undefined): string[] => {
  if (!tex) return [];
  const candidates: Array<string | null | undefined> = [
    tex.bbmcpId,
    tex.uuid,
    tex.id,
    tex.uid,
    tex._uuid
  ];
  const unique = new Set<string>();
  candidates.forEach((value) => {
    if (!value) return;
    const label = String(value).trim();
    if (!label) return;
    unique.add(label);
  });
  return Array.from(unique);
};

export const readTextureSize = (
  tex: TextureInstance | null | undefined
): { width?: number; height?: number } => {
  if (!tex) return {};
  const width = pickPositive(
    tex.canvas?.width,
    tex.width,
    tex.img?.naturalWidth,
    tex.img?.width
  );
  const height = pickPositive(
    tex.canvas?.height,
    tex.height,
    tex.img?.naturalHeight,
    tex.img?.height
  );
  return { width, height };
};

export const readAnimationId = (anim: AnimationClip | null | undefined): string | null => {
  if (!anim) return null;
  const raw = anim.bbmcpId ?? anim.uuid ?? anim.id ?? anim.uid ?? anim._uuid ?? null;
  return raw ? String(raw) : null;
};

export const assignVec3 = (target: UnknownRecord, key: string, value: [number, number, number]) => {
  const current = target[key];
  if (current && typeof (current as { set?: (x: number, y: number, z: number) => void }).set === 'function') {
    (current as { set: (x: number, y: number, z: number) => void }).set(value[0], value[1], value[2]);
    return;
  }
  if (Array.isArray(current)) {
    target[key] = [...value];
    return;
  }
  if (current && typeof current === 'object') {
    const vec = current as { x?: number; y?: number; z?: number };
    vec.x = value[0];
    vec.y = value[1];
    vec.z = value[2];
    return;
  }
  target[key] = [...value];
};

export const assignVec2 = (target: UnknownRecord, key: string, value: [number, number]) => {
  const current = target[key];
  if (current && typeof (current as { set?: (x: number, y: number) => void }).set === 'function') {
    (current as { set: (x: number, y: number) => void }).set(value[0], value[1]);
    return;
  }
  if (Array.isArray(current)) {
    target[key] = [...value];
    return;
  }
  if (current && typeof current === 'object') {
    const vec = current as { x?: number; y?: number };
    vec.x = value[0];
    vec.y = value[1];
    return;
  }
  target[key] = [...value];
};

export const assignAnimationLength = (target: AnimationClip, value: number) => {
  if (typeof target.length === 'number') {
    target.length = value;
  }
  if (typeof target.animation_length === 'number') {
    target.animation_length = value;
  }
  if (typeof target.duration === 'number') {
    target.duration = value;
  }
};

export const normalizeParent = (parent: OutlinerNode | null | undefined): OutlinerNode | null => {
  if (!parent) return null;
  if (Array.isArray(parent.children)) return parent;
  if (parent.children === undefined) {
    parent.children = [];
    return parent;
  }
  return parent.children && Array.isArray(parent.children) ? parent : null;
};

export const moveOutlinerNode = (
  node: OutlinerNode | null,
  parent: OutlinerNode | null,
  outliner: OutlinerApi | undefined,
  log: Logger,
  kind: 'bone' | 'cube'
): boolean => {
  if (!node) return false;
  if (parent === node) return false;
  const currentParent = node.parent ?? null;
  if (parent === currentParent || (!parent && !currentParent)) return true;
  detachFromOutliner(node, outliner);
  return attachToOutliner(parent, outliner, node, log, kind);
};

export const removeOutlinerNode = (node: OutlinerNode | null, outliner: OutlinerApi | undefined): boolean => {
  if (!node) return false;
  if (typeof node.remove === 'function') {
    node.remove();
    return true;
  }
  if (typeof node.delete === 'function') {
    node.delete();
    return true;
  }
  return detachFromOutliner(node, outliner);
};

const detachFromOutliner = (node: OutlinerNode | null, outliner: OutlinerApi | undefined): boolean => {
  if (!node) return false;
  const parent = node.parent ?? null;
  const root = outliner?.root;
  const rootChildren = !Array.isArray(root) ? root?.children : undefined;
  const removed =
    removeNodeFromCollection(parent?.children, node) ||
    (Array.isArray(root) ? removeNodeFromCollection(root, node) : false) ||
    removeNodeFromCollection(rootChildren, node);
  if (node && 'parent' in node) {
    node.parent = null;
  }
  return removed;
};

const removeNodeFromCollection = (collection: OutlinerNode[] | undefined, node: OutlinerNode): boolean => {
  if (!Array.isArray(collection)) return false;
  const idx = collection.indexOf(node);
  if (idx < 0) return false;
  collection.splice(idx, 1);
  return true;
};

export const attachToOutliner = (
  parent: OutlinerNode | null,
  outliner: OutlinerApi | undefined,
  node: OutlinerNode,
  log: Logger,
  kind: 'bone' | 'cube'
): boolean => {
  if (!parent && isNodeInOutlinerRoot(outliner, node)) return true;

  if (parent && isNodeInParent(parent, node)) return true;
  if (parent && typeof node?.addTo === 'function') {
    try {
      node.addTo(parent);
      if (isNodeInParent(parent, node)) return true;
    } catch (err) {
      const message = errorMessage(err);
      log.warn(`${kind} addTo parent failed; fallback to root`, { message });
    }
  }

  const root = outliner?.root;
  if (Array.isArray(root)) {
    if (!root.includes(node)) root.push(node);
    return true;
  }
  if (root && !Array.isArray(root) && Array.isArray(root.children)) {
    if (!root.children.includes(node)) root.children.push(node);
    return true;
  }
  if (outliner && !root) {
    outliner.root = [node];
    return true;
  }
  return false;
};

const isNodeInParent = (parent: OutlinerNode | null, node: OutlinerNode | null): boolean => {
  if (!parent || !node) return false;
  return Array.isArray(parent.children) && parent.children.includes(node);
};

const isNodeInOutlinerRoot = (outliner: OutlinerApi | undefined, node: OutlinerNode | null): boolean => {
  if (!outliner || !node) return false;
  const root = outliner.root;
  if (Array.isArray(root) && root.includes(node)) return true;
  if (root && !Array.isArray(root) && Array.isArray(root.children)) {
    return root.children.includes(node);
  }
  return false;
};

const pickPositive = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
};

export const hasUnsavedChanges = (blockbench: BlockbenchApi | undefined): boolean => {
  try {
    if (typeof blockbench?.hasUnsavedChanges === 'function') {
      const result = blockbench.hasUnsavedChanges();
      if (typeof result === 'boolean') return result;
    }
    const project = blockbench?.project ?? readGlobals().Project ?? null;
    if (project) {
      if (typeof project.saved === 'boolean') return !project.saved;
      if (typeof project.isSaved === 'boolean') return !project.isSaved;
      if (typeof project.dirty === 'boolean') return project.dirty;
      if (typeof project.isDirty === 'boolean') return project.isDirty;
      if (typeof project.unsaved === 'boolean') return project.unsaved;
      if (typeof project.hasUnsavedChanges === 'function') {
        return Boolean(project.hasUnsavedChanges());
      }
    }
  } catch (err) {
    return false;
  }
  return false;
};

export const markProjectSaved = (blockbench: BlockbenchApi | undefined): void => {
  try {
    const project = blockbench?.project ?? readGlobals().Project ?? null;
    if (!project) return;
    if (typeof project.markSaved === 'function') {
      project.markSaved();
    }
    if (typeof project.saved === 'boolean') project.saved = true;
    if (typeof project.isSaved === 'boolean') project.isSaved = true;
    if (typeof project.dirty === 'boolean') project.dirty = false;
    if (typeof project.isDirty === 'boolean') project.isDirty = false;
    if (typeof project.unsaved === 'boolean') project.unsaved = false;
  } catch (err) {
    // Best-effort: some Blockbench builds may not expose these fields.
  }
};
