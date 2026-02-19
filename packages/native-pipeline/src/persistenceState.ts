import { cloneEvent, cloneFolder, cloneJob, cloneProject, cloneTreeChildRef } from './clone';
import {
  asFolder,
  asLockState,
  asNativeJob,
  asProjectLock,
  asProjectEvent,
  asProjectSnapshot,
  asTreeChildRef,
  normalizeCounter
} from './persistenceParsers';
import { cloneHierarchy, deriveHierarchyStats, synchronizeProjectSnapshot } from './projectSnapshotSync';
import { getDefaultSeedState } from './seeds';
import { createNativePipelineState, type NativePipelineState } from './state';
import type {
  NativeJob,
  NativeProjectEvent,
  NativeProjectFolder,
  NativeProjectSnapshot,
  NativeTreeChildRef
} from './types';

const PERSISTED_STATE_VERSION = 2;

type PersistedProjectEventsEntry = {
  projectId: string;
  events: NativeProjectEvent[];
};

type PersistedFolderEntry = NativeProjectFolder;

type PersistedProjectLockEntry = {
  projectId: string;
  lock: NativeProjectSnapshot['projectLock'];
};

export type PersistedPipelineState = {
  version: number;
  workspaceId?: string;
  nextJobId: number;
  nextEntityNonce: number;
  nextSeq: number;
  projects: NativeProjectSnapshot[];
  folders: PersistedFolderEntry[];
  rootChildren: NativeTreeChildRef[];
  jobs: NativeJob[];
  queuedJobIds: string[];
  projectLocks: PersistedProjectLockEntry[];
  projectEvents: PersistedProjectEventsEntry[];
};

export type LockState = {
  owner: string;
  expiresAt: string;
};

export { normalizeCounter } from './persistenceParsers';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const serializeState = (state: NativePipelineState): PersistedPipelineState => ({
  version: PERSISTED_STATE_VERSION,
  workspaceId: state.workspaceId,
  nextJobId: state.nextJobId,
  nextEntityNonce: state.nextEntityNonce,
  nextSeq: state.nextSeq,
  projects: Array.from(state.projects.values()).map((project) => cloneProject(project)),
  folders: Array.from(state.folders.values()).map((folder) => cloneFolder(folder)),
  rootChildren: state.rootChildren.map((entry) => cloneTreeChildRef(entry)),
  jobs: Array.from(state.jobs.values()).map((job) => cloneJob(job)),
  queuedJobIds: [...state.queuedJobIds],
  projectLocks: Array.from(state.projectLocks.entries()).map(([projectId, lock]) => ({
    projectId,
    lock: lock
      ? {
          ownerAgentId: lock.ownerAgentId,
          ownerSessionId: lock.ownerSessionId,
          token: lock.token,
          acquiredAt: lock.acquiredAt,
          heartbeatAt: lock.heartbeatAt,
          expiresAt: lock.expiresAt,
          mode: lock.mode
        }
      : undefined
  })),
  projectEvents: Array.from(state.projectEvents.entries()).map(([projectId, events]) => ({
    projectId,
    events: events.map((event) => cloneEvent(event))
  }))
});

const parseJobCounter = (jobId: string): number => {
  const match = /^job-(\d+)$/.exec(jobId);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const repairLegacySeedHierarchy = (state: NativePipelineState): void => {
  const seedState = getDefaultSeedState();
  const seedByProjectId = new Map(seedState.projects.map((project) => [project.projectId, project]));

  for (const project of state.projects.values()) {
    const seed = seedByProjectId.get(project.projectId);
    if (!seed) {
      continue;
    }
    if (project.name !== seed.name || project.parentFolderId !== seed.parentFolderId) {
      continue;
    }

    const current = deriveHierarchyStats(project.hierarchy);
    const expected = deriveHierarchyStats(seed.hierarchy);
    const looksLegacySparse = current.cubes === 0 && current.bones <= 2;
    const hasSeedGeometry = expected.bones > 0 || expected.cubes > 0;
    if (!looksLegacySparse || !hasSeedGeometry) {
      continue;
    }

    project.hierarchy = cloneHierarchy(seed.hierarchy);
    synchronizeProjectSnapshot(project);
  }
};

const rebuildProjectEventsFromSnapshots = (state: NativePipelineState): void => {
  state.projectEvents.clear();
  const projects = Array.from(state.projects.values()).sort((left, right) => left.projectId.localeCompare(right.projectId));
  for (const project of projects) {
    const seq = state.nextSeq;
    state.nextSeq += 1;
    state.projectEvents.set(project.projectId, [
      {
        seq,
        event: 'project_snapshot',
        data: cloneProject(project)
      }
    ]);
  }
};

export const deserializeState = (value: unknown): NativePipelineState | null => {
  if (!isRecord(value)) return null;
  if (value.version !== PERSISTED_STATE_VERSION) return null;
  if (
    !Array.isArray(value.projects) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.rootChildren) ||
    !Array.isArray(value.jobs) ||
    !Array.isArray(value.queuedJobIds) ||
    !Array.isArray(value.projectEvents)
  ) {
    return null;
  }

  const workspaceId =
    typeof value.workspaceId === 'string' && value.workspaceId.trim().length > 0 ? value.workspaceId.trim() : 'ws_default';
  const state = createNativePipelineState(workspaceId);
  for (const rawFolder of value.folders) {
    const folder = asFolder(rawFolder);
    if (!folder) continue;
    state.folders.set(folder.folderId, folder);
  }

  for (const rawRootChild of value.rootChildren) {
    const rootChild = asTreeChildRef(rawRootChild);
    if (!rootChild) continue;
    if (rootChild.kind === 'folder' && !state.folders.has(rootChild.id)) continue;
    state.rootChildren.push(rootChild);
  }

  for (const rawProject of value.projects) {
    const project = asProjectSnapshot(rawProject);
    if (!project) continue;
    if (!project.workspaceId) {
      project.workspaceId = workspaceId;
    }
    if (project.parentFolderId && !state.folders.has(project.parentFolderId)) {
      project.parentFolderId = null;
    }
    state.projects.set(project.projectId, project);
  }

  for (const folder of state.folders.values()) {
    folder.children = folder.children.filter((entry) => {
      if (entry.kind === 'folder') {
        return state.folders.has(entry.id);
      }
      return state.projects.has(entry.id);
    });
  }

  state.rootChildren.splice(
    0,
    state.rootChildren.length,
    ...state.rootChildren.filter((entry) => {
      if (entry.kind === 'folder') {
        return state.folders.has(entry.id);
      }
      return state.projects.has(entry.id);
    })
  );

  const referencedFolderIds = new Set<string>();
  const referencedProjectIds = new Set<string>();
  for (const rootChild of state.rootChildren) {
    if (rootChild.kind === 'folder') {
      referencedFolderIds.add(rootChild.id);
    } else {
      referencedProjectIds.add(rootChild.id);
    }
  }
  for (const folder of state.folders.values()) {
    for (const child of folder.children) {
      if (child.kind === 'folder') {
        referencedFolderIds.add(child.id);
      } else {
        referencedProjectIds.add(child.id);
      }
    }
  }

  for (const folder of state.folders.values()) {
    if (referencedFolderIds.has(folder.folderId)) {
      continue;
    }
    if (folder.parentFolderId && state.folders.has(folder.parentFolderId)) {
      const parent = state.folders.get(folder.parentFolderId);
      parent?.children.push({ kind: 'folder', id: folder.folderId });
      continue;
    }
    folder.parentFolderId = null;
    state.rootChildren.push({ kind: 'folder', id: folder.folderId });
  }

  for (const project of state.projects.values()) {
    if (referencedProjectIds.has(project.projectId)) {
      continue;
    }
    if (project.parentFolderId && state.folders.has(project.parentFolderId)) {
      const parent = state.folders.get(project.parentFolderId);
      parent?.children.push({ kind: 'project', id: project.projectId });
      continue;
    }
    project.parentFolderId = null;
    state.rootChildren.push({ kind: 'project', id: project.projectId });
  }

  repairLegacySeedHierarchy(state);

  let maxJobCounter = 0;
  for (const rawJob of value.jobs) {
    const job = asNativeJob(rawJob);
    if (!job) continue;
    state.jobs.set(job.id, job);
    maxJobCounter = Math.max(maxJobCounter, parseJobCounter(job.id));
  }

  for (const rawJobId of value.queuedJobIds) {
    if (typeof rawJobId !== 'string') continue;
    if (!state.jobs.has(rawJobId)) continue;
    if (state.queuedJobIds.includes(rawJobId)) continue;
    state.queuedJobIds.push(rawJobId);
  }

  const rawProjectLocks = Array.isArray(value.projectLocks) ? value.projectLocks : [];
  for (const rawLockEntry of rawProjectLocks) {
    if (!isRecord(rawLockEntry) || typeof rawLockEntry.projectId !== 'string') {
      continue;
    }
    const lock = asProjectLock(rawLockEntry.lock);
    if (!lock) {
      continue;
    }
    state.projectLocks.set(rawLockEntry.projectId, lock);
  }

  for (const project of state.projects.values()) {
    const lock = state.projectLocks.get(project.projectId);
    if (lock) {
      project.projectLock = {
        ownerAgentId: lock.ownerAgentId,
        ownerSessionId: lock.ownerSessionId,
        token: lock.token,
        acquiredAt: lock.acquiredAt,
        heartbeatAt: lock.heartbeatAt,
        expiresAt: lock.expiresAt,
        mode: lock.mode
      };
      continue;
    }
    delete project.projectLock;
  }

  let maxSeq = 0;
  for (const rawBucket of value.projectEvents) {
    if (!isRecord(rawBucket) || typeof rawBucket.projectId !== 'string' || !Array.isArray(rawBucket.events)) continue;
    const events = rawBucket.events
      .map((entry) => asProjectEvent(entry))
      .filter((entry): entry is NativeProjectEvent => Boolean(entry));
    if (events.length === 0) continue;
    for (const event of events) {
      maxSeq = Math.max(maxSeq, event.seq);
    }
    state.projectEvents.set(rawBucket.projectId, events);
  }

  state.nextJobId = Math.max(normalizeCounter(value.nextJobId, 1), maxJobCounter + 1);
  state.nextEntityNonce = normalizeCounter(value.nextEntityNonce, 1);
  state.nextSeq = Math.max(normalizeCounter(value.nextSeq, 1), maxSeq + 1);
  rebuildProjectEventsFromSnapshots(state);
  return state;
};

export const parseLockState = (value: unknown): LockState | null => {
  return asLockState(value);
};

export const isLockActive = (lock: LockState): boolean => {
  const expiresAt = Date.parse(lock.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now();
};
