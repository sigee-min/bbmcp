import type { ProjectSnapshotStorePort, QueueStorePort, StreamEventStorePort } from '@ashfox/backend-core';
import { appendProjectSnapshotEvent, getProjectEventsSince as readProjectEventsSince } from './eventRepository';
import {
  claimNextJob as claimNativeJob,
  completeJob as completeNativeJob,
  failJob as failNativeJob,
  getJob as readJob,
  listProjectJobs as readProjectJobs,
  submitJob as submitNativeJob
} from './jobRepository';
import {
  acquireProjectLock as acquireNativeProjectLock,
  getProjectLock as readProjectLock,
  releaseExpiredProjectLocks,
  releaseProjectLock as releaseNativeProjectLock,
  releaseProjectLocksByOwner as releaseNativeProjectLocksByOwner,
  renewProjectLock as renewNativeProjectLock
} from './projectLockRepository';
import {
  createFolder as createProjectFolder,
  createProject as createProjectSnapshot,
  deleteFolder as deleteProjectFolder,
  deleteProject as deleteProjectSnapshot,
  ensureProject,
  getProject as readProject,
  getProjectTree as readProjectTree,
  listProjects as readProjects,
  moveFolder as moveProjectFolder,
  moveProject as moveProjectSnapshot,
  renameFolder as renameProjectFolder,
  renameProject as renameProjectSnapshot
} from './projectRepository';
import { createNativePipelineState, type NativePipelineState } from './state';
import type {
  NativeCreateFolderInput,
  NativeCreateProjectInput,
  NativeJob,
  NativeJobResult,
  NativeJobSubmitInput,
  NativeAcquireProjectLockInput,
  NativeMoveFolderInput,
  NativeMoveProjectInput,
  NativeProjectLock,
  NativeProjectEvent,
  NativeProjectFolder,
  NativeReleaseProjectLockInput,
  NativeRenewProjectLockInput,
  NativeProjectSnapshot,
  NativeProjectTreeSnapshot
} from './types';

const requireWorkspaceId = (workspaceId?: string): string => {
  if (typeof workspaceId !== 'string') {
    throw new Error('workspaceId is required');
  }
  const normalized = workspaceId.trim();
  if (normalized.length === 0) {
    throw new Error('workspaceId is required');
  }
  return normalized;
};

export type NativePipelineQueueStorePort = QueueStorePort<NativeJob, NativeJobSubmitInput, NativeJobResult>;

export type NativePipelineProjectStorePort = ProjectSnapshotStorePort<NativeProjectSnapshot>;

export type NativePipelineStreamStorePort = StreamEventStorePort<NativeProjectEvent>;

export interface NativePipelineStorePort
  extends NativePipelineQueueStorePort,
    NativePipelineProjectStorePort,
    NativePipelineStreamStorePort {
  reset(): Promise<void>;
  getProjectTree(query?: string, workspaceId?: string): Promise<NativeProjectTreeSnapshot>;
  createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder>;
  renameFolder(folderId: string, nextName: string, workspaceId?: string): Promise<NativeProjectFolder | null>;
  moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null>;
  deleteFolder(folderId: string, workspaceId?: string): Promise<boolean>;
  createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot>;
  renameProject(projectId: string, nextName: string, workspaceId?: string): Promise<NativeProjectSnapshot | null>;
  moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null>;
  deleteProject(projectId: string, workspaceId?: string): Promise<boolean>;
  getProjectLock(projectId: string, workspaceId?: string): Promise<NativeProjectLock | null>;
  acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock>;
  renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null>;
  releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean>;
  releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null, workspaceId?: string): Promise<number>;
}

export class NativePipelineStore implements NativePipelineStorePort {
  private readonly states = new Map<string, NativePipelineState>();

  constructor() {}

  async reset(): Promise<void> {
    this.states.clear();
  }

  async listProjects(query?: string, workspaceId?: string): Promise<NativeProjectSnapshot[]> {
    const state = this.getWorkspaceState(workspaceId);
    this.runLockMaintenance(state);
    return readProjects(state, query);
  }

  async getProjectTree(query?: string, workspaceId?: string): Promise<NativeProjectTreeSnapshot> {
    const state = this.getWorkspaceState(workspaceId);
    this.runLockMaintenance(state);
    return readProjectTree(state, query);
  }

  async getProject(projectId: string, workspaceId?: string): Promise<NativeProjectSnapshot | null> {
    const state = this.getWorkspaceState(workspaceId);
    this.runLockMaintenance(state);
    return readProject(state, projectId);
  }

  async createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder> {
    const state = this.getWorkspaceState(input.workspaceId);
    return createProjectFolder(state, input);
  }

  async renameFolder(folderId: string, nextName: string, workspaceId?: string): Promise<NativeProjectFolder | null> {
    const state = this.getWorkspaceState(workspaceId);
    return renameProjectFolder(state, folderId, nextName);
  }

  async moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null> {
    const state = this.getWorkspaceState(input.workspaceId);
    return moveProjectFolder(state, input);
  }

  async deleteFolder(folderId: string, workspaceId?: string): Promise<boolean> {
    const state = this.getWorkspaceState(workspaceId);
    return deleteProjectFolder(state, folderId);
  }

  async createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return createProjectSnapshot(state, input, emitProjectSnapshot);
  }

  async renameProject(projectId: string, nextName: string, workspaceId?: string): Promise<NativeProjectSnapshot | null> {
    const state = this.getWorkspaceState(workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return renameProjectSnapshot(state, projectId, nextName, emitProjectSnapshot);
  }

  async moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return moveProjectSnapshot(state, input, emitProjectSnapshot);
  }

  async deleteProject(projectId: string, workspaceId?: string): Promise<boolean> {
    const state = this.getWorkspaceState(workspaceId);
    return deleteProjectSnapshot(state, projectId);
  }

  async getProjectLock(projectId: string, workspaceId?: string): Promise<NativeProjectLock | null> {
    const state = this.getWorkspaceState(workspaceId);
    this.runLockMaintenance(state);
    return readProjectLock(state, projectId);
  }

  async acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return acquireNativeProjectLock(state, input, emitProjectSnapshot);
  }

  async renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return renewNativeProjectLock(state, input, emitProjectSnapshot);
  }

  async releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return releaseNativeProjectLock(state, input, emitProjectSnapshot);
  }

  async releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null, workspaceId?: string): Promise<number> {
    const state = this.getWorkspaceState(workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return releaseNativeProjectLocksByOwner(state, ownerAgentId, ownerSessionId, emitProjectSnapshot);
  }

  async listProjectJobs(projectId: string, workspaceId?: string): Promise<NativeJob[]> {
    const state = this.getWorkspaceState(workspaceId);
    return readProjectJobs(state, projectId);
  }

  async getJob(jobId: string, workspaceId?: string): Promise<NativeJob | null> {
    const state = this.getWorkspaceState(workspaceId);
    return readJob(state, jobId);
  }

  async submitJob(input: NativeJobSubmitInput): Promise<NativeJob> {
    const state = this.getWorkspaceState(input.workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return submitNativeJob(
      state,
      input,
      (projectId) => ensureProject(state, projectId, emitProjectSnapshot, input.workspaceId),
      emitProjectSnapshot
    );
  }

  async claimNextJob(workerId: string, workspaceId?: string): Promise<NativeJob | null> {
    const state = this.getWorkspaceState(workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return claimNativeJob(state, workerId, emitProjectSnapshot);
  }

  async completeJob(jobId: string, result?: NativeJobResult, workspaceId?: string): Promise<NativeJob | null> {
    const state = this.getWorkspaceState(workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return completeNativeJob(state, jobId, result, emitProjectSnapshot);
  }

  async failJob(jobId: string, error: string, workspaceId?: string): Promise<NativeJob | null> {
    const state = this.getWorkspaceState(workspaceId);
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    return failNativeJob(state, jobId, error, emitProjectSnapshot);
  }

  async getProjectEventsSince(projectId: string, lastSeq: number, workspaceId?: string): Promise<NativeProjectEvent[]> {
    const state = this.getWorkspaceState(workspaceId);
    this.runLockMaintenance(state);
    return readProjectEventsSince(state, projectId, lastSeq);
  }

  private runLockMaintenance(state: NativePipelineState): void {
    const emitProjectSnapshot = this.emitProjectSnapshotFor(state);
    releaseExpiredProjectLocks(state, emitProjectSnapshot);
  }

  private emitProjectSnapshotFor(state: NativePipelineState): (project: NativeProjectSnapshot) => void {
    return (project) => {
      appendProjectSnapshotEvent(state, project);
    };
  }

  private getWorkspaceState(workspaceId?: string): NativePipelineState {
    const normalizedWorkspaceId = requireWorkspaceId(workspaceId);
    const existing = this.states.get(normalizedWorkspaceId);
    if (existing) {
      return existing;
    }
    return this.ensureWorkspaceState(normalizedWorkspaceId);
  }

  private ensureWorkspaceState(workspaceId: string): NativePipelineState {
    const existing = this.states.get(workspaceId);
    if (existing) {
      return existing;
    }
    const state = createNativePipelineState(workspaceId);
    this.states.set(workspaceId, state);
    return state;
  }
}
