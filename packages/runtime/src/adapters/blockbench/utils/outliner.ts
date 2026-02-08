import type { OutlinerApi, OutlinerNode } from '../../../types/blockbench';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';

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
  kind: 'bone' | 'cube' | 'mesh'
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
  kind: 'bone' | 'cube' | 'mesh'
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
