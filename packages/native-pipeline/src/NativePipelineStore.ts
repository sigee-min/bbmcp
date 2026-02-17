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
import { ensureProject, getProject as readProject, listProjects as readProjects, seedProjects } from './projectRepository';
import { createNativePipelineState, resetNativePipelineState } from './state';
import type { NativeJob, NativeJobResult, NativeJobSubmitInput, NativeProjectEvent, NativeProjectSnapshot } from './types';

export type NativePipelineQueueStorePort = QueueStorePort<NativeJob, NativeJobSubmitInput, NativeJobResult>;

export type NativePipelineProjectStorePort = ProjectSnapshotStorePort<NativeProjectSnapshot>;

export type NativePipelineStreamStorePort = StreamEventStorePort<NativeProjectEvent>;

export interface NativePipelineStorePort
  extends NativePipelineQueueStorePort,
    NativePipelineProjectStorePort,
    NativePipelineStreamStorePort {
  reset(): Promise<void>;
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

  async getProject(projectId: string): Promise<NativeProjectSnapshot | null> {
    return readProject(this.state, projectId);
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
