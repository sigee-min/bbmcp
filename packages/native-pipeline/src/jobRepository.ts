import { cloneJob } from './clone';
import { allocateNativeJobId, type NativePipelineState } from './state';
import type { NativeJob, NativeJobSubmitInput, NativeProjectSnapshot } from './types';

const nowIso = (): string => new Date().toISOString();

type ResolveProject = (projectId: string) => NativeProjectSnapshot;
type EmitSnapshot = (project: NativeProjectSnapshot) => void;

export const listProjectJobs = (state: NativePipelineState, projectId: string): NativeJob[] =>
  Array.from(state.jobs.values())
    .filter((job) => job.projectId === projectId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((job) => cloneJob(job));

export const getJob = (state: NativePipelineState, jobId: string): NativeJob | null => {
  const job = state.jobs.get(jobId);
  return job ? cloneJob(job) : null;
};

export const submitJob = (
  state: NativePipelineState,
  input: NativeJobSubmitInput,
  resolveProject: ResolveProject,
  emitProjectSnapshot: EmitSnapshot
): NativeJob => {
  const project = resolveProject(input.projectId);
  const job: NativeJob = {
    id: allocateNativeJobId(state),
    projectId: project.projectId,
    kind: input.kind,
    status: 'queued',
    createdAt: nowIso()
  };

  state.jobs.set(job.id, job);
  state.queuedJobIds.push(job.id);

  project.activeJob = { id: job.id, status: 'queued' };
  emitProjectSnapshot(project);

  return cloneJob(job);
};

export const claimNextJob = (
  state: NativePipelineState,
  workerId: string,
  emitProjectSnapshot: EmitSnapshot
): NativeJob | null => {
  const nextId = state.queuedJobIds.shift();
  if (!nextId) return null;

  const job = state.jobs.get(nextId);
  if (!job) return null;

  job.status = 'running';
  job.workerId = workerId;
  job.startedAt = nowIso();

  const project = state.projects.get(job.projectId);
  if (project) {
    project.activeJob = { id: job.id, status: 'running' };
    emitProjectSnapshot(project);
  }

  return cloneJob(job);
};

export const completeJob = (
  state: NativePipelineState,
  jobId: string,
  result: Record<string, unknown> | undefined,
  emitProjectSnapshot: EmitSnapshot
): NativeJob | null => {
  const job = state.jobs.get(jobId);
  if (!job) return null;

  job.status = 'completed';
  job.result = result ? { ...result } : undefined;
  job.completedAt = nowIso();

  const project = state.projects.get(job.projectId);
  if (project) {
    project.revision += 1;
    project.hasGeometry = true;
    project.stats.cubes += 1;
    project.activeJob = { id: job.id, status: 'completed' };
    emitProjectSnapshot(project);
  }

  return cloneJob(job);
};

export const failJob = (
  state: NativePipelineState,
  jobId: string,
  error: string,
  emitProjectSnapshot: EmitSnapshot
): NativeJob | null => {
  const job = state.jobs.get(jobId);
  if (!job) return null;

  job.status = 'failed';
  job.error = error;
  job.completedAt = nowIso();

  const project = state.projects.get(job.projectId);
  if (project) {
    project.revision += 1;
    project.activeJob = { id: job.id, status: 'failed' };
    emitProjectSnapshot(project);
  }

  return cloneJob(job);
};
