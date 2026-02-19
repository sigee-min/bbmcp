import type { NativePipelineState } from './state';
import { MAX_FOLDER_DEPTH, type NativeProjectFolder, type NativeProjectSnapshot, type NativeTreeChildRef } from './types';

const MAX_LOOP_GUARD = 64;

export const normalizeParentFolderId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeIndex = (index: number | undefined, maxLength: number): number => {
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    return maxLength;
  }
  const rounded = Math.trunc(index);
  if (rounded < 0) {
    return 0;
  }
  if (rounded > maxLength) {
    return maxLength;
  }
  return rounded;
};

export const findContainerChildren = (state: NativePipelineState, parentFolderId: string | null): NativeTreeChildRef[] => {
  if (!parentFolderId) {
    return state.rootChildren;
  }
  const folder = state.folders.get(parentFolderId);
  if (!folder) {
    throw new Error(`Folder not found: ${parentFolderId}`);
  }
  return folder.children;
};

const removeChildRef = (children: NativeTreeChildRef[], kind: NativeTreeChildRef['kind'], id: string): boolean => {
  const index = children.findIndex((entry) => entry.kind === kind && entry.id === id);
  if (index < 0) {
    return false;
  }
  children.splice(index, 1);
  return true;
};

export const insertChildRef = (
  children: NativeTreeChildRef[],
  entry: NativeTreeChildRef,
  index: number | undefined
): void => {
  const nextIndex = normalizeIndex(index, children.length);
  children.splice(nextIndex, 0, entry);
};

export const resolveReorderInsertIndex = (
  children: NativeTreeChildRef[],
  kind: NativeTreeChildRef['kind'],
  id: string,
  index: number | undefined
): number | undefined => {
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    return index;
  }

  const sourceIndex = children.findIndex((entry) => entry.kind === kind && entry.id === id);
  if (sourceIndex < 0) {
    return normalizeIndex(index, children.length);
  }

  const normalizedTarget = normalizeIndex(index, children.length);
  if (normalizedTarget > sourceIndex) {
    return normalizedTarget - 1;
  }
  return normalizedTarget;
};

export const detachFolderFromParent = (state: NativePipelineState, folder: NativeProjectFolder): void => {
  const parentChildren = findContainerChildren(state, folder.parentFolderId);
  if (removeChildRef(parentChildren, 'folder', folder.folderId)) {
    return;
  }
  for (const candidate of state.folders.values()) {
    if (removeChildRef(candidate.children, 'folder', folder.folderId)) {
      return;
    }
  }
  removeChildRef(state.rootChildren, 'folder', folder.folderId);
};

export const detachProjectFromParent = (state: NativePipelineState, project: NativeProjectSnapshot): void => {
  const parentChildren = findContainerChildren(state, project.parentFolderId);
  if (removeChildRef(parentChildren, 'project', project.projectId)) {
    return;
  }
  for (const candidate of state.folders.values()) {
    if (removeChildRef(candidate.children, 'project', project.projectId)) {
      return;
    }
  }
  removeChildRef(state.rootChildren, 'project', project.projectId);
};

const getFolderDepth = (state: NativePipelineState, folderId: string): number => {
  let depth = 0;
  let currentId: string | null = folderId;
  let guard = 0;
  while (currentId) {
    const folder = state.folders.get(currentId);
    if (!folder) {
      break;
    }
    depth += 1;
    currentId = folder.parentFolderId;
    guard += 1;
    if (guard > MAX_LOOP_GUARD) {
      throw new Error('Folder hierarchy cycle detected.');
    }
  }
  return depth;
};

export const getSubtreeFolderHeight = (state: NativePipelineState, folderId: string): number => {
  const folder = state.folders.get(folderId);
  if (!folder) {
    return 1;
  }
  let maxChildHeight = 0;
  for (const child of folder.children) {
    if (child.kind !== 'folder') {
      continue;
    }
    maxChildHeight = Math.max(maxChildHeight, getSubtreeFolderHeight(state, child.id));
  }
  return maxChildHeight + 1;
};

export const ensureFolderDepthLimit = (
  state: NativePipelineState,
  targetParentFolderId: string | null,
  subtreeHeight: number
): void => {
  const parentDepth = targetParentFolderId ? getFolderDepth(state, targetParentFolderId) : 0;
  if (parentDepth + subtreeHeight > MAX_FOLDER_DEPTH) {
    throw new Error(`Folder depth limit exceeded (max depth ${MAX_FOLDER_DEPTH}).`);
  }
};

export const isFolderDescendant = (state: NativePipelineState, folderId: string, candidateDescendantId: string): boolean => {
  const stack = [folderId];
  let guard = 0;
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    if (currentId === candidateDescendantId) {
      return true;
    }
    const folder = state.folders.get(currentId);
    if (!folder) {
      continue;
    }
    for (const child of folder.children) {
      if (child.kind === 'folder') {
        stack.push(child.id);
      }
    }
    guard += 1;
    if (guard > 1024) {
      throw new Error('Folder hierarchy traversal overflow.');
    }
  }
  return false;
};

export const collectFolderSubtree = (state: NativePipelineState, folderId: string): string[] => {
  const collected: string[] = [];
  const stack = [folderId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    collected.push(currentId);
    const current = state.folders.get(currentId);
    if (!current) {
      continue;
    }
    for (const child of current.children) {
      if (child.kind === 'folder') {
        stack.push(child.id);
      }
    }
  }
  return collected;
};

export const collectProjectsInFolders = (state: NativePipelineState, folderIds: readonly string[]): string[] => {
  const projectIds = new Set<string>();
  for (const folderId of folderIds) {
    const folder = state.folders.get(folderId);
    if (!folder) {
      continue;
    }
    for (const child of folder.children) {
      if (child.kind === 'project') {
        projectIds.add(child.id);
      }
    }
  }
  return [...projectIds];
};

export const ensureTargetFolderExists = (state: NativePipelineState, parentFolderId: string | null): void => {
  if (!parentFolderId) {
    return;
  }
  if (!state.folders.has(parentFolderId)) {
    throw new Error(`Folder not found: ${parentFolderId}`);
  }
};
