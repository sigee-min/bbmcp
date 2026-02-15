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

export class NativePipelineStore {
  private readonly state = createNativePipelineState();

  constructor() {
    this.seedDefaults();
  }

  reset(): void {
    resetNativePipelineState(this.state);
    this.seedDefaults();
  }

  listProjects(query?: string): NativeProjectSnapshot[] {
    return readProjects(this.state, query);
  }

  getProject(projectId: string): NativeProjectSnapshot | null {
    return readProject(this.state, projectId);
  }

  listProjectJobs(projectId: string): NativeJob[] {
    return readProjectJobs(this.state, projectId);
  }

  getJob(jobId: string): NativeJob | null {
    return readJob(this.state, jobId);
  }

  submitJob(input: NativeJobSubmitInput): NativeJob {
    return submitNativeJob(
      this.state,
      input,
      (projectId) => ensureProject(this.state, projectId, this.emitProjectSnapshot),
      this.emitProjectSnapshot
    );
  }

  claimNextJob(workerId: string): NativeJob | null {
    return claimNativeJob(this.state, workerId, this.emitProjectSnapshot);
  }

  completeJob(jobId: string, result?: Record<string, unknown>): NativeJob | null {
    return completeNativeJob(this.state, jobId, result, this.emitProjectSnapshot);
  }

  failJob(jobId: string, error: string): NativeJob | null {
    return failNativeJob(this.state, jobId, error, this.emitProjectSnapshot);
  }

  getProjectEventsSince(projectId: string, lastSeq: number): NativeProjectEvent[] {
    return readProjectEventsSince(this.state, projectId, lastSeq);
  }

  private readonly emitProjectSnapshot = (project: NativeProjectSnapshot): void => {
    appendProjectSnapshotEvent(this.state, project);
  };

  private seedDefaults(): void {
    seedProjects(this.state, this.emitProjectSnapshot);
  }
}
