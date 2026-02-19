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
  renameProject as renameProjectSnapshot,
  seedProjects
} from './projectRepository';
import { createNativePipelineState, resetNativePipelineState } from './state';
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

export type NativePipelineQueueStorePort = QueueStorePort<NativeJob, NativeJobSubmitInput, NativeJobResult>;

export type NativePipelineProjectStorePort = ProjectSnapshotStorePort<NativeProjectSnapshot>;

export type NativePipelineStreamStorePort = StreamEventStorePort<NativeProjectEvent>;

export interface NativePipelineStorePort
  extends NativePipelineQueueStorePort,
    NativePipelineProjectStorePort,
    NativePipelineStreamStorePort {
  reset(): Promise<void>;
  getProjectTree(query?: string): Promise<NativeProjectTreeSnapshot>;
  createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder>;
  renameFolder(folderId: string, nextName: string): Promise<NativeProjectFolder | null>;
  moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null>;
  deleteFolder(folderId: string): Promise<boolean>;
  createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot>;
  renameProject(projectId: string, nextName: string): Promise<NativeProjectSnapshot | null>;
  moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null>;
  deleteProject(projectId: string): Promise<boolean>;
  getProjectLock(projectId: string): Promise<NativeProjectLock | null>;
  acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock>;
  renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null>;
  releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean>;
  releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null): Promise<number>;
}

export class NativePipelineStore implements NativePipelineStorePort {
  private readonly state = createNativePipelineState();

  constructor() {
    this.seedDefaults();
  }

  async reset(): Promise<void> {
    resetNativePipelineState(this.state);
    this.seedDefaults();
  }

  async listProjects(query?: string): Promise<NativeProjectSnapshot[]> {
    return readProjects(this.state, query);
  }

  async getProjectTree(query?: string): Promise<NativeProjectTreeSnapshot> {
    return readProjectTree(this.state, query);
  }

  async getProject(projectId: string): Promise<NativeProjectSnapshot | null> {
    return readProject(this.state, projectId);
  }

  async createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder> {
    return createProjectFolder(this.state, input);
  }

  async renameFolder(folderId: string, nextName: string): Promise<NativeProjectFolder | null> {
    return renameProjectFolder(this.state, folderId, nextName);
  }

  async moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null> {
    return moveProjectFolder(this.state, input);
  }

  async deleteFolder(folderId: string): Promise<boolean> {
    return deleteProjectFolder(this.state, folderId);
  }

  async createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot> {
    return createProjectSnapshot(this.state, input, this.emitProjectSnapshot);
  }

  async renameProject(projectId: string, nextName: string): Promise<NativeProjectSnapshot | null> {
    return renameProjectSnapshot(this.state, projectId, nextName, this.emitProjectSnapshot);
  }

  async moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null> {
    return moveProjectSnapshot(this.state, input, this.emitProjectSnapshot);
  }

  async deleteProject(projectId: string): Promise<boolean> {
    return deleteProjectSnapshot(this.state, projectId);
  }

  async getProjectLock(projectId: string): Promise<NativeProjectLock | null> {
    releaseExpiredProjectLocks(this.state, this.emitProjectSnapshot);
    return readProjectLock(this.state, projectId);
  }

  async acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock> {
    return acquireNativeProjectLock(this.state, input, this.emitProjectSnapshot);
  }

  async renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null> {
    return renewNativeProjectLock(this.state, input, this.emitProjectSnapshot);
  }

  async releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean> {
    return releaseNativeProjectLock(this.state, input, this.emitProjectSnapshot);
  }

  async releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null): Promise<number> {
    return releaseNativeProjectLocksByOwner(this.state, ownerAgentId, ownerSessionId, this.emitProjectSnapshot);
  }

  async listProjectJobs(projectId: string): Promise<NativeJob[]> {
    return readProjectJobs(this.state, projectId);
  }

  async getJob(jobId: string): Promise<NativeJob | null> {
    return readJob(this.state, jobId);
  }

  async submitJob(input: NativeJobSubmitInput): Promise<NativeJob> {
    return submitNativeJob(
      this.state,
      input,
      (projectId) => ensureProject(this.state, projectId, this.emitProjectSnapshot),
      this.emitProjectSnapshot
    );
  }

  async claimNextJob(workerId: string): Promise<NativeJob | null> {
    return claimNativeJob(this.state, workerId, this.emitProjectSnapshot);
  }

  async completeJob(jobId: string, result?: NativeJobResult): Promise<NativeJob | null> {
    return completeNativeJob(this.state, jobId, result, this.emitProjectSnapshot);
  }

  async failJob(jobId: string, error: string): Promise<NativeJob | null> {
    return failNativeJob(this.state, jobId, error, this.emitProjectSnapshot);
  }

  async getProjectEventsSince(projectId: string, lastSeq: number): Promise<NativeProjectEvent[]> {
    return readProjectEventsSince(this.state, projectId, lastSeq);
  }

  private readonly emitProjectSnapshot = (project: NativeProjectSnapshot): void => {
    appendProjectSnapshotEvent(this.state, project);
  };

  private seedDefaults(): void {
    seedProjects(this.state, this.emitProjectSnapshot);
  }
}
