import { createHash } from 'node:crypto';
import { cloneFolder, cloneProject, cloneTreeChildRef } from './clone';
import {
  collectFolderSubtree,
  collectProjectsInFolders,
  detachFolderFromParent,
  detachProjectFromParent,
  ensureFolderDepthLimit,
  ensureTargetFolderExists,
  findContainerChildren,
  getSubtreeFolderHeight,
  insertChildRef,
  isFolderDescendant,
  normalizeParentFolderId,
  resolveReorderInsertIndex
} from './projectTreeOps';
import { synchronizeProjectSnapshot } from './projectSnapshotSync';
import { getDefaultSeedState } from './seeds';
import type { NativePipelineState } from './state';
import {
  MAX_FOLDER_DEPTH,
  type NativeCreateFolderInput,
  type NativeCreateProjectInput,
  type NativeMoveFolderInput,
  type NativeMoveProjectInput,
  type NativeProjectLockState,
  type NativeProjectFolder,
  type NativeProjectSnapshot,
  type NativeProjectTreeNode,
  type NativeProjectTreeSnapshot,
  type NativeTreeChildRef
} from './types';

const PROJECT_ID_PREFIX = 'prj';
const FOLDER_ID_PREFIX = 'fld';
const DEFAULT_WORKSPACE_ID = 'ws_default';

const normalizeName = (value: string, fallback: string): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 96) : fallback;
};

const normalizeQuery = (query?: string): string => (typeof query === 'string' ? query.trim().toLowerCase() : '');
const normalizeWorkspaceId = (workspaceId?: string): string => {
  if (typeof workspaceId !== 'string') {
    return DEFAULT_WORKSPACE_ID;
  }
  const normalized = workspaceId.trim();
  return normalized.length > 0 ? normalized : DEFAULT_WORKSPACE_ID;
};

const computeEntityId = (state: NativePipelineState, prefix: string, seed: string): string => {
  while (true) {
    const nonce = state.nextEntityNonce;
    state.nextEntityNonce += 1;
    const digest = createHash('sha256').update(`${prefix}:${nonce}:${seed}`).digest('hex').slice(0, 12);
    const candidate = `${prefix}_${digest}`;
    if (prefix === PROJECT_ID_PREFIX && state.projects.has(candidate)) {
      continue;
    }
    if (prefix === FOLDER_ID_PREFIX && state.folders.has(candidate)) {
      continue;
    }
    return candidate;
  }
};


const createDefaultProject = (
  projectId: string,
  name: string,
  parentFolderId: string | null,
  workspaceId?: string
): NativeProjectSnapshot => ({
  projectId,
  workspaceId: normalizeWorkspaceId(workspaceId),
  name,
  parentFolderId,
  revision: 1,
  hasGeometry: false,
  focusAnchor: [0, 24, 0],
  hierarchy: [],
  animations: [],
  stats: {
    bones: 0,
    cubes: 0
  },
  textureSources: [],
  textures: []
});

const removeProjectJobs = (state: NativePipelineState, projectId: string): void => {
  for (const [jobId, job] of state.jobs.entries()) {
    if (job.projectId === projectId) {
      state.jobs.delete(jobId);
    }
  }
  for (let index = state.queuedJobIds.length - 1; index >= 0; index -= 1) {
    const queuedId = state.queuedJobIds[index];
    const queuedJob = state.jobs.get(queuedId);
    if (!queuedJob || queuedJob.projectId === projectId) {
      state.queuedJobIds.splice(index, 1);
    }
  }
};

const removeProjectInternal = (state: NativePipelineState, projectId: string): void => {
  const project = state.projects.get(projectId);
  if (!project) {
    return;
  }
  detachProjectFromParent(state, project);
  state.projects.delete(projectId);
  state.projectLocks.delete(projectId);
  state.projectEvents.delete(projectId);
  removeProjectJobs(state, projectId);
};

const resolveTreeLockState = (project: NativeProjectSnapshot): NativeProjectLockState =>
  project.projectLock ? 'locked-by-other' : 'unlocked';


const buildTreeNodes = (
  state: NativePipelineState,
  children: readonly NativeTreeChildRef[],
  depth: number,
  query: string
): NativeProjectTreeNode[] => {
  const nodes: NativeProjectTreeNode[] = [];
  for (const child of children) {
    if (child.kind === 'folder') {
      const folder = state.folders.get(child.id);
      if (!folder) {
        continue;
      }
      const childNodes = buildTreeNodes(state, folder.children, depth + 1, query);
      const folderMatches =
        query.length === 0 ||
        folder.name.toLowerCase().includes(query) ||
        folder.folderId.toLowerCase().includes(query);
      if (!folderMatches && childNodes.length === 0) {
        continue;
      }
      nodes.push({
        kind: 'folder',
        folderId: folder.folderId,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        depth,
        children: childNodes
      });
      continue;
    }

    const project = state.projects.get(child.id);
    if (!project) {
      continue;
    }
    const projectMatches =
      query.length === 0 ||
      project.name.toLowerCase().includes(query) ||
      project.projectId.toLowerCase().includes(query);
    if (!projectMatches) {
      continue;
    }
    nodes.push({
      kind: 'project',
      projectId: project.projectId,
      name: project.name,
      parentFolderId: project.parentFolderId,
      depth,
      activeJobStatus: project.activeJob?.status ?? null,
      lockState: resolveTreeLockState(project),
      lockedBySelf: false,
      lockOwnerAgentId: project.projectLock?.ownerAgentId ?? null
    });
  }
  return nodes;
};

const findProjectById = (state: NativePipelineState, projectId: string): NativeProjectSnapshot | null => {
  const project = state.projects.get(projectId);
  return project ?? null;
};

const findFolderById = (state: NativePipelineState, folderId: string): NativeProjectFolder | null => {
  const folder = state.folders.get(folderId);
  return folder ?? null;
};


export const seedProjects = (
  state: NativePipelineState,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void,
  workspaceId?: string
): void => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const seeded = getDefaultSeedState();
  for (const folder of seeded.folders) {
    state.folders.set(folder.folderId, cloneFolder(folder));
  }
  for (const child of seeded.rootChildren) {
    state.rootChildren.push(cloneTreeChildRef(child));
  }
  for (const project of seeded.projects) {
    const nextProject = cloneProject(project);
    nextProject.workspaceId = normalizedWorkspaceId;
    synchronizeProjectSnapshot(nextProject);
    state.projects.set(nextProject.projectId, nextProject);
    emitProjectSnapshot(nextProject);
  }
};

export const listProjects = (state: NativePipelineState, query?: string): NativeProjectSnapshot[] => {
  const normalizedQuery = normalizeQuery(query);
  return Array.from(state.projects.values())
    .filter((project) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        project.projectId.toLowerCase().includes(normalizedQuery) ||
        project.name.toLowerCase().includes(normalizedQuery)
      );
    })
    .map((project) => cloneProject(project));
};

export const getProjectTree = (state: NativePipelineState, query?: string): NativeProjectTreeSnapshot => {
  const normalizedQuery = normalizeQuery(query);
  return {
    maxFolderDepth: MAX_FOLDER_DEPTH,
    roots: buildTreeNodes(state, state.rootChildren, 1, normalizedQuery)
  };
};

export const getProject = (state: NativePipelineState, projectId: string): NativeProjectSnapshot | null => {
  const project = findProjectById(state, projectId);
  return project ? cloneProject(project) : null;
};

export const createFolder = (state: NativePipelineState, input: NativeCreateFolderInput): NativeProjectFolder => {
  const parentFolderId = normalizeParentFolderId(input.parentFolderId);
  ensureTargetFolderExists(state, parentFolderId);
  ensureFolderDepthLimit(state, parentFolderId, 1);

  const name = normalizeName(input.name, 'New Folder');
  const folderId = computeEntityId(state, FOLDER_ID_PREFIX, `${parentFolderId ?? 'root'}:${name}`);
  const folder: NativeProjectFolder = {
    folderId,
    name,
    parentFolderId,
    children: []
  };
  state.folders.set(folderId, folder);
  const targetChildren = findContainerChildren(state, parentFolderId);
  insertChildRef(targetChildren, { kind: 'folder', id: folderId }, input.index);
  return cloneFolder(folder);
};

export const renameFolder = (state: NativePipelineState, folderId: string, nextName: string): NativeProjectFolder | null => {
  const folder = findFolderById(state, folderId);
  if (!folder) {
    return null;
  }
  folder.name = normalizeName(nextName, folder.name);
  return cloneFolder(folder);
};

export const moveFolder = (state: NativePipelineState, input: NativeMoveFolderInput): NativeProjectFolder | null => {
  const folder = findFolderById(state, input.folderId);
  if (!folder) {
    return null;
  }

  const previousParentFolderId = folder.parentFolderId;
  const parentFolderId = normalizeParentFolderId(input.parentFolderId);
  if (parentFolderId === folder.folderId) {
    throw new Error('Cannot move a folder into itself.');
  }
  ensureTargetFolderExists(state, parentFolderId);
  if (parentFolderId && isFolderDescendant(state, folder.folderId, parentFolderId)) {
    throw new Error('Cannot move a folder into a descendant folder.');
  }

  const subtreeHeight = getSubtreeFolderHeight(state, folder.folderId);
  ensureFolderDepthLimit(state, parentFolderId, subtreeHeight);

  const adjustedIndex =
    previousParentFolderId === parentFolderId
      ? resolveReorderInsertIndex(findContainerChildren(state, previousParentFolderId), 'folder', folder.folderId, input.index)
      : input.index;

  detachFolderFromParent(state, folder);
  const nextChildren = findContainerChildren(state, parentFolderId);
  insertChildRef(nextChildren, { kind: 'folder', id: folder.folderId }, adjustedIndex);
  folder.parentFolderId = parentFolderId;
  return cloneFolder(folder);
};

export const deleteFolder = (state: NativePipelineState, folderId: string): boolean => {
  const folder = findFolderById(state, folderId);
  if (!folder) {
    return false;
  }

  detachFolderFromParent(state, folder);
  const subtreeFolderIds = collectFolderSubtree(state, folderId);
  const subtreeProjectIds = collectProjectsInFolders(state, subtreeFolderIds);
  for (const projectId of subtreeProjectIds) {
    removeProjectInternal(state, projectId);
  }
  for (const entryFolderId of subtreeFolderIds) {
    state.folders.delete(entryFolderId);
  }
  return true;
};

export const createProject = (
  state: NativePipelineState,
  input: NativeCreateProjectInput,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void
): NativeProjectSnapshot => {
  const parentFolderId = normalizeParentFolderId(input.parentFolderId);
  ensureTargetFolderExists(state, parentFolderId);

  const name = normalizeName(input.name, 'My Project');
  const workspaceSeed = normalizeWorkspaceId(input.workspaceId);
  const projectId = computeEntityId(state, PROJECT_ID_PREFIX, `project:${workspaceSeed}`);
  const project = createDefaultProject(projectId, name, parentFolderId, input.workspaceId);
  synchronizeProjectSnapshot(project);
  state.projects.set(projectId, project);

  const targetChildren = findContainerChildren(state, parentFolderId);
  insertChildRef(targetChildren, { kind: 'project', id: projectId }, input.index);
  emitProjectSnapshot(project);
  return cloneProject(project);
};

export const renameProject = (
  state: NativePipelineState,
  projectId: string,
  nextName: string,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void
): NativeProjectSnapshot | null => {
  const project = findProjectById(state, projectId);
  if (!project) {
    return null;
  }
  project.name = normalizeName(nextName, project.name);
  synchronizeProjectSnapshot(project);
  project.revision += 1;
  emitProjectSnapshot(project);
  return cloneProject(project);
};

export const moveProject = (
  state: NativePipelineState,
  input: NativeMoveProjectInput,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void
): NativeProjectSnapshot | null => {
  const project = findProjectById(state, input.projectId);
  if (!project) {
    return null;
  }

  const previousParentFolderId = project.parentFolderId;
  const parentFolderId = normalizeParentFolderId(input.parentFolderId);
  ensureTargetFolderExists(state, parentFolderId);

  const adjustedIndex =
    previousParentFolderId === parentFolderId
      ? resolveReorderInsertIndex(findContainerChildren(state, previousParentFolderId), 'project', project.projectId, input.index)
      : input.index;

  detachProjectFromParent(state, project);
  const nextChildren = findContainerChildren(state, parentFolderId);
  insertChildRef(nextChildren, { kind: 'project', id: project.projectId }, adjustedIndex);
  project.parentFolderId = parentFolderId;
  synchronizeProjectSnapshot(project);
  project.revision += 1;
  emitProjectSnapshot(project);
  return cloneProject(project);
};

export const deleteProject = (state: NativePipelineState, projectId: string): boolean => {
  if (!state.projects.has(projectId)) {
    return false;
  }
  removeProjectInternal(state, projectId);
  return true;
};

export const ensureProject = (
  state: NativePipelineState,
  projectId: string,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void,
  workspaceId?: string
): NativeProjectSnapshot => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const existing = findProjectById(state, projectId);
  if (existing) {
    if (!existing.workspaceId) {
      existing.workspaceId = normalizedWorkspaceId;
      synchronizeProjectSnapshot(existing);
      existing.revision += 1;
      emitProjectSnapshot(existing);
    }
    return existing;
  }

  const created = createDefaultProject(projectId, projectId, null, normalizedWorkspaceId);
  synchronizeProjectSnapshot(created);
  state.projects.set(projectId, created);
  state.rootChildren.push({ kind: 'project', id: projectId });
  emitProjectSnapshot(created);
  return created;
};
