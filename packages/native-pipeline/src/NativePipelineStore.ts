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
import type { NativeJob, NativeJobSubmitInput, NativeProjectEvent, NativeProjectSnapshot } from './types';

export interface NativePipelineStorePort {
  reset(): Promise<void>;
  listProjects(query?: string): Promise<NativeProjectSnapshot[]>;
  getProject(projectId: string): Promise<NativeProjectSnapshot | null>;
  listProjectJobs(projectId: string): Promise<NativeJob[]>;
  getJob(jobId: string): Promise<NativeJob | null>;
  submitJob(input: NativeJobSubmitInput): Promise<NativeJob>;
  claimNextJob(workerId: string): Promise<NativeJob | null>;
  completeJob(jobId: string, result?: Record<string, unknown>): Promise<NativeJob | null>;
  failJob(jobId: string, error: string): Promise<NativeJob | null>;
  getProjectEventsSince(projectId: string, lastSeq: number): Promise<NativeProjectEvent[]>;
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

  async completeJob(jobId: string, result?: Record<string, unknown>): Promise<NativeJob | null> {
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
