import { cloneJob } from './clone';
import { cloneHierarchy, synchronizeProjectSnapshot } from './projectSnapshotSync';
import { allocateNativeJobId, type NativePipelineState } from './state';
import {
  normalizeNativeJobPayload,
  normalizeNativeJobResult,
  normalizeSupportedNativeJobKind,
  type NativeJob,
  type NativeJobResult,
  type NativeJobSubmitInput,
  type NativeProjectSnapshot
} from './types';

const nowIso = (): string => new Date().toISOString();
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS_LIMIT = 10;
const DEFAULT_LEASE_MS = 30_000;
const MIN_LEASE_MS = 5_000;
const MAX_LEASE_MS = 300_000;
const MAX_RETRY_BACKOFF_MS = 5_000;

type ResolveProject = (projectId: string) => NativeProjectSnapshot;
type EmitSnapshot = (project: NativeProjectSnapshot) => void;

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.trunc(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

const enqueueUnique = (state: NativePipelineState, jobId: string): void => {
  if (state.queuedJobIds.includes(jobId)) return;
  state.queuedJobIds.push(jobId);
};

const computeRetryBackoffMs = (attemptCount: number): number => {
  const exponent = Math.max(0, attemptCount - 1);
  const backoff = 250 * 2 ** exponent;
  return Math.min(MAX_RETRY_BACKOFF_MS, backoff);
};

const applyCompletedJobProjection = (project: NativeProjectSnapshot, job: NativeJob): void => {
  if (job.kind !== 'gltf.convert') {
    return;
  }

  if (Array.isArray(job.result?.hierarchy)) {
    project.hierarchy = cloneHierarchy(job.result.hierarchy);
  }
  synchronizeProjectSnapshot(project);
};

const recoverExpiredRunningJobs = (state: NativePipelineState): void => {
  const now = Date.now();
  for (const job of state.jobs.values()) {
    if (job.status !== 'running') continue;
    if (!job.leaseExpiresAt) continue;
    const expiresAt = Date.parse(job.leaseExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;
    job.status = 'queued';
    delete job.workerId;
    delete job.startedAt;
    delete job.leaseExpiresAt;
    enqueueUnique(state, job.id);
  }
};

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
  const kind = normalizeSupportedNativeJobKind(input.kind);
  const baseJob = {
    id: allocateNativeJobId(state),
    projectId: project.projectId,
    status: 'queued' as const,
    attemptCount: 0,
    maxAttempts: clampInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, MAX_ATTEMPTS_LIMIT),
    leaseMs: clampInteger(input.leaseMs, DEFAULT_LEASE_MS, MIN_LEASE_MS, MAX_LEASE_MS),
    createdAt: nowIso()
  };
  let job: NativeJob;
  if (kind === 'gltf.convert') {
    const payload = normalizeNativeJobPayload('gltf.convert', input.payload);
    job = {
      ...baseJob,
      kind: 'gltf.convert',
      ...(payload ? { payload } : {})
    };
  } else {
    const payload = normalizeNativeJobPayload('texture.preflight', input.payload);
    job = {
      ...baseJob,
      kind: 'texture.preflight',
      ...(payload ? { payload } : {})
    };
  }

  state.jobs.set(job.id, job);
  enqueueUnique(state, job.id);

  project.activeJob = { id: job.id, status: 'queued' };
  emitProjectSnapshot(project);

  return cloneJob(job);
};

export const claimNextJob = (
  state: NativePipelineState,
  workerId: string,
  emitProjectSnapshot: EmitSnapshot
): NativeJob | null => {
  recoverExpiredRunningJobs(state);

  const queueSize = state.queuedJobIds.length;
  for (let index = 0; index < queueSize; index += 1) {
    const nextId = state.queuedJobIds.shift();
    if (!nextId) break;
    const job = state.jobs.get(nextId);
    if (!job || job.status !== 'queued') {
      continue;
    }
    if (job.nextRetryAt) {
      const retryAt = Date.parse(job.nextRetryAt);
      if (Number.isFinite(retryAt) && retryAt > Date.now()) {
        enqueueUnique(state, job.id);
        continue;
      }
      delete job.nextRetryAt;
    }

    job.status = 'running';
    job.workerId = workerId;
    job.startedAt = nowIso();
    job.attemptCount += 1;
    job.leaseExpiresAt = new Date(Date.now() + job.leaseMs).toISOString();
    delete job.error;
    delete job.completedAt;
    delete job.deadLetter;

    const project = state.projects.get(job.projectId);
    if (project) {
      project.activeJob = { id: job.id, status: 'running' };
      emitProjectSnapshot(project);
    }

    return cloneJob(job);
  }

  return null;
};

export const completeJob = (
  state: NativePipelineState,
  jobId: string,
  result: NativeJobResult | undefined,
  emitProjectSnapshot: EmitSnapshot
): NativeJob | null => {
  const job = state.jobs.get(jobId);
  if (!job) return null;

  const normalizedResult = normalizeNativeJobResult(job.kind, result);

  job.status = 'completed';
  job.result = normalizedResult;
  job.completedAt = nowIso();
  delete job.nextRetryAt;
  delete job.leaseExpiresAt;
  delete job.deadLetter;

  const project = state.projects.get(job.projectId);
  if (project) {
    project.revision += 1;
    applyCompletedJobProjection(project, job);
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
  delete job.leaseExpiresAt;

  const shouldRetry = job.attemptCount < job.maxAttempts;
  if (shouldRetry) {
    const retryAt = new Date(Date.now() + computeRetryBackoffMs(job.attemptCount)).toISOString();
    job.status = 'queued';
    job.nextRetryAt = retryAt;
    delete job.completedAt;
    delete job.workerId;
    delete job.startedAt;
    enqueueUnique(state, job.id);
  } else {
    job.deadLetter = true;
    delete job.nextRetryAt;
  }

  const project = state.projects.get(job.projectId);
  if (project) {
    project.revision += 1;
    project.activeJob = {
      id: job.id,
      status: shouldRetry ? 'queued' : 'failed'
    };
    emitProjectSnapshot(project);
  }

  return cloneJob(job);
};
