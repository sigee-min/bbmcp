import { createHash, randomUUID } from 'node:crypto';
import type {
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  ProjectRepositoryWithRevisionGuard
} from '@ashfox/backend-core';
import { cloneEvent, cloneJob, cloneProject } from './clone';
import { appendProjectSnapshotEvent, getProjectEventsSince as readProjectEventsSince } from './eventRepository';
import {
  claimNextJob as claimNativeJob,
  completeJob as completeNativeJob,
  failJob as failNativeJob,
  getJob as readJob,
  listProjectJobs as readProjectJobs,
  submitJob as submitNativeJob
} from './jobRepository';
import type { NativePipelineStorePort } from './NativePipelineStore';
import { ensureProject, getProject as readProject, listProjects as readProjects, seedProjects } from './projectRepository';
import { createNativePipelineState, resetNativePipelineState, type NativePipelineState } from './state';
import {
  isSupportedNativeJobKind,
  normalizeNativeJobPayload,
  normalizeNativeJobResult,
  type NativeJob,
  type NativeJobResult,
  type NativeJobStatus,
  type NativeJobSubmitInput,
  type NativeProjectEvent,
  type NativeProjectSnapshot
} from './types';

const PERSISTED_STATE_VERSION = 1;
const DEFAULT_STATE_SCOPE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-state-v1'
};
const DEFAULT_LOCK_SCOPE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-lock-v1'
};
const DEFAULT_LOCK_TTL_MS = 2_000;
const DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_RETRY_MS = 30;

type PersistedProjectEventsEntry = {
  projectId: string;
  events: NativeProjectEvent[];
};

type PersistedPipelineState = {
  version: number;
  nextJobId: number;
  nextSeq: number;
  projects: NativeProjectSnapshot[];
  jobs: NativeJob[];
  queuedJobIds: string[];
  projectEvents: PersistedProjectEventsEntry[];
};

type LockState = {
  owner: string;
  expiresAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const canGuardRevisions = (repository: ProjectRepository): repository is ProjectRepository & ProjectRepositoryWithRevisionGuard =>
  typeof (repository as { saveIfRevision?: unknown }).saveIfRevision === 'function';

const nowIso = (): string => new Date().toISOString();

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const normalizeCounter = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const next = Math.trunc(value);
  return next < 1 ? fallback : next;
};

const isNativeJobStatus = (value: unknown): value is NativeJobStatus =>
  value === 'queued' || value === 'running' || value === 'completed' || value === 'failed';

const asFocusAnchor = (value: unknown): readonly [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof z !== 'number' ||
    !Number.isFinite(z)
  ) {
    return undefined;
  }
  return [x, y, z];
};

const asHierarchyChild = (
  value: unknown
): {
  id: string;
  name: string;
  kind: 'bone' | 'cube';
  children: never[];
} | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (value.kind !== 'bone' && value.kind !== 'cube') return null;
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    children: []
  };
};

const asHierarchyNode = (
  value: unknown
): {
  id: string;
  name: string;
  kind: 'bone' | 'cube';
  children: Array<{
    id: string;
    name: string;
    kind: 'bone' | 'cube';
    children: never[];
  }>;
} | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (value.kind !== 'bone' && value.kind !== 'cube') return null;
  const children = Array.isArray(value.children)
    ? value.children
        .map((entry) => asHierarchyChild(entry))
        .filter(
          (
            entry
          ): entry is {
            id: string;
            name: string;
            kind: 'bone' | 'cube';
            children: never[];
          } => Boolean(entry)
        )
    : [];
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    children
  };
};

const asAnimationEntry = (
  value: unknown
): {
  id: string;
  name: string;
  length: number;
  loop: boolean;
} | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (typeof value.length !== 'number' || !Number.isFinite(value.length)) return null;
  if (typeof value.loop !== 'boolean') return null;
  return {
    id: value.id,
    name: value.name,
    length: value.length,
    loop: value.loop
  };
};

const asProjectSnapshot = (value: unknown): NativeProjectSnapshot | null => {
  if (!isRecord(value)) return null;
  if (typeof value.projectId !== 'string' || typeof value.name !== 'string') return null;
  if (typeof value.revision !== 'number' || !Number.isFinite(value.revision)) return null;
  if (typeof value.hasGeometry !== 'boolean') return null;
  if (!isRecord(value.stats)) return null;
  if (typeof value.stats.bones !== 'number' || !Number.isFinite(value.stats.bones)) return null;
  if (typeof value.stats.cubes !== 'number' || !Number.isFinite(value.stats.cubes)) return null;
  const hierarchy = Array.isArray(value.hierarchy)
    ? value.hierarchy
        .map((entry) => asHierarchyNode(entry))
        .filter(
          (
            entry
          ): entry is {
            id: string;
            name: string;
            kind: 'bone' | 'cube';
            children: Array<{
              id: string;
              name: string;
              kind: 'bone' | 'cube';
              children: never[];
            }>;
          } => Boolean(entry)
        )
    : [];
  const animations = Array.isArray(value.animations)
    ? value.animations
        .map((entry) => asAnimationEntry(entry))
        .filter(
          (
            entry
          ): entry is {
            id: string;
            name: string;
            length: number;
            loop: boolean;
          } => Boolean(entry)
        )
    : [];
  const activeJob = isRecord(value.activeJob) && typeof value.activeJob.id === 'string' && isNativeJobStatus(value.activeJob.status)
    ? { id: value.activeJob.id, status: value.activeJob.status }
    : undefined;

  return {
    projectId: value.projectId,
    name: value.name,
    revision: Math.trunc(value.revision),
    hasGeometry: value.hasGeometry,
    ...(asFocusAnchor(value.focusAnchor) ? { focusAnchor: asFocusAnchor(value.focusAnchor) } : {}),
    hierarchy,
    animations,
    stats: {
      bones: Math.trunc(value.stats.bones),
      cubes: Math.trunc(value.stats.cubes)
    },
    ...(activeJob ? { activeJob } : {})
  };
};

const asNativeJob = (value: unknown): NativeJob | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.projectId !== 'string' || typeof value.kind !== 'string') return null;
  if (!isSupportedNativeJobKind(value.kind)) return null;
  if (!isNativeJobStatus(value.status)) return null;
  if (typeof value.attemptCount !== 'number' || !Number.isFinite(value.attemptCount)) return null;
  if (typeof value.maxAttempts !== 'number' || !Number.isFinite(value.maxAttempts)) return null;
  if (typeof value.leaseMs !== 'number' || !Number.isFinite(value.leaseMs)) return null;
  if (typeof value.createdAt !== 'string') return null;

  const kind = value.kind;
  const baseJob = {
    id: value.id,
    projectId: value.projectId,
    status: value.status,
    attemptCount: Math.trunc(value.attemptCount),
    maxAttempts: Math.trunc(value.maxAttempts),
    leaseMs: Math.trunc(value.leaseMs),
    createdAt: value.createdAt,
    ...(typeof value.startedAt === 'string' ? { startedAt: value.startedAt } : {}),
    ...(typeof value.leaseExpiresAt === 'string' ? { leaseExpiresAt: value.leaseExpiresAt } : {}),
    ...(typeof value.nextRetryAt === 'string' ? { nextRetryAt: value.nextRetryAt } : {}),
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(typeof value.workerId === 'string' ? { workerId: value.workerId } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    ...(value.deadLetter === true ? { deadLetter: true } : {})
  };

  try {
    if (kind === 'gltf.convert') {
      const payload = normalizeNativeJobPayload('gltf.convert', value.payload);
      const result = normalizeNativeJobResult('gltf.convert', value.result);
      return {
        ...baseJob,
        kind: 'gltf.convert',
        ...(payload ? { payload } : {}),
        ...(result ? { result } : {})
      };
    }

    const payload = normalizeNativeJobPayload('texture.preflight', value.payload);
    const result = normalizeNativeJobResult('texture.preflight', value.result);
    return {
      ...baseJob,
      kind: 'texture.preflight',
      ...(payload ? { payload } : {}),
      ...(result ? { result } : {})
    };
  } catch {
    return null;
  }
};

const asProjectEvent = (value: unknown): NativeProjectEvent | null => {
  if (!isRecord(value)) return null;
  if (typeof value.seq !== 'number' || !Number.isFinite(value.seq)) return null;
  if (value.event !== 'project_snapshot') return null;
  const data = asProjectSnapshot(value.data);
  if (!data) return null;
  return {
    seq: Math.trunc(value.seq),
    event: 'project_snapshot',
    data
  };
};

const serializeState = (state: NativePipelineState): PersistedPipelineState => ({
  version: PERSISTED_STATE_VERSION,
  nextJobId: state.nextJobId,
  nextSeq: state.nextSeq,
  projects: Array.from(state.projects.values()).map((project) => cloneProject(project)),
  jobs: Array.from(state.jobs.values()).map((job) => cloneJob(job)),
  queuedJobIds: [...state.queuedJobIds],
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

const deserializeState = (value: unknown): NativePipelineState | null => {
  if (!isRecord(value)) return null;
  if (value.version !== PERSISTED_STATE_VERSION) return null;
  if (!Array.isArray(value.projects) || !Array.isArray(value.jobs) || !Array.isArray(value.queuedJobIds) || !Array.isArray(value.projectEvents)) {
    return null;
  }

  const state = createNativePipelineState();
  for (const rawProject of value.projects) {
    const project = asProjectSnapshot(rawProject);
    if (!project) continue;
    state.projects.set(project.projectId, project);
  }

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
  state.nextSeq = Math.max(normalizeCounter(value.nextSeq, 1), maxSeq + 1);
  return state;
};

const parseLockState = (value: unknown): LockState | null => {
  if (!isRecord(value)) return null;
  if (typeof value.owner !== 'string') return null;
  if (typeof value.expiresAt !== 'string') return null;
  return {
    owner: value.owner,
    expiresAt: value.expiresAt
  };
};

const isLockActive = (lock: LockState): boolean => {
  const expiresAt = Date.parse(lock.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now();
};

export interface PersistentNativePipelineStoreOptions {
  stateScope?: ProjectRepositoryScope;
  lockScope?: ProjectRepositoryScope;
  lockTtlMs?: number;
  lockAcquireTimeoutMs?: number;
  lockRetryMs?: number;
}

export class PersistentNativePipelineStore implements NativePipelineStorePort {
  private readonly stateScope: ProjectRepositoryScope;
  private readonly lockScope: ProjectRepositoryScope;
  private readonly lockTtlMs: number;
  private readonly lockAcquireTimeoutMs: number;
  private readonly lockRetryMs: number;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly repository: ProjectRepository,
    options: PersistentNativePipelineStoreOptions = {}
  ) {
    this.stateScope = options.stateScope ?? DEFAULT_STATE_SCOPE;
    this.lockScope = options.lockScope ?? DEFAULT_LOCK_SCOPE;
    this.lockTtlMs = normalizeCounter(options.lockTtlMs, DEFAULT_LOCK_TTL_MS);
    this.lockAcquireTimeoutMs = normalizeCounter(options.lockAcquireTimeoutMs, DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS);
    this.lockRetryMs = normalizeCounter(options.lockRetryMs, DEFAULT_LOCK_RETRY_MS);
  }

  async reset(): Promise<void> {
    await this.withMutation((state) => {
      resetNativePipelineState(state);
      seedProjects(state, (project) => appendProjectSnapshotEvent(state, project));
    });
  }

  async listProjects(query?: string): Promise<NativeProjectSnapshot[]> {
    const state = await this.readState();
    return readProjects(state, query);
  }

  async getProject(projectId: string): Promise<NativeProjectSnapshot | null> {
    const state = await this.readState();
    return readProject(state, projectId);
  }

  async listProjectJobs(projectId: string): Promise<NativeJob[]> {
    const state = await this.readState();
    return readProjectJobs(state, projectId);
  }

  async getJob(jobId: string): Promise<NativeJob | null> {
    const state = await this.readState();
    return readJob(state, jobId);
  }

  async submitJob(input: NativeJobSubmitInput): Promise<NativeJob> {
    return this.withMutation((state) =>
      submitNativeJob(
        state,
        input,
        (projectId) => ensureProject(state, projectId, (project) => appendProjectSnapshotEvent(state, project)),
        (project) => appendProjectSnapshotEvent(state, project)
      )
    );
  }

  async claimNextJob(workerId: string): Promise<NativeJob | null> {
    return this.withMutation((state) => claimNativeJob(state, workerId, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async completeJob(jobId: string, result?: NativeJobResult): Promise<NativeJob | null> {
    return this.withMutation((state) => completeNativeJob(state, jobId, result, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async failJob(jobId: string, error: string): Promise<NativeJob | null> {
    return this.withMutation((state) => failNativeJob(state, jobId, error, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async getProjectEventsSince(projectId: string, lastSeq: number): Promise<NativeProjectEvent[]> {
    const state = await this.readState();
    return readProjectEventsSince(state, projectId, lastSeq);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.withLock(async () => {
        const existingRecord = await this.repository.find(this.stateScope);
        const hydrated = deserializeState(existingRecord?.state);
        if (hydrated) return;
        const seeded = createNativePipelineState();
        seedProjects(seeded, (project) => appendProjectSnapshotEvent(seeded, project));
        await this.persistState(seeded, existingRecord ?? null);
      }).catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  private async readState(): Promise<NativePipelineState> {
    await this.ensureInitialized();
    const record = await this.repository.find(this.stateScope);
    const hydrated = deserializeState(record?.state);
    if (hydrated) return hydrated;

    return this.withLock(async () => {
      const latestRecord = await this.repository.find(this.stateScope);
      const latestHydrated = deserializeState(latestRecord?.state);
      if (latestHydrated) return latestHydrated;
      const seeded = createNativePipelineState();
      seedProjects(seeded, (project) => appendProjectSnapshotEvent(seeded, project));
      await this.persistState(seeded, latestRecord ?? null);
      return seeded;
    });
  }

  private async withMutation<TResult>(mutator: (state: NativePipelineState) => TResult): Promise<TResult> {
    await this.ensureInitialized();
    return this.withLock(async () => {
      const existingRecord = await this.repository.find(this.stateScope);
      const hydrated = deserializeState(existingRecord?.state);
      const state = hydrated ?? createNativePipelineState();
      if (!hydrated) {
        seedProjects(state, (project) => appendProjectSnapshotEvent(state, project));
      }
      const result = mutator(state);
      await this.persistState(state, existingRecord ?? null);
      return result;
    });
  }

  private async persistState(state: NativePipelineState, existingRecord: PersistedProjectRecord | null): Promise<void> {
    const serialized = serializeState(state);
    const serializedJson = JSON.stringify(serialized);
    const revision = createHash('sha256').update(serializedJson).digest('hex');
    const now = nowIso();
    const nextRecord: PersistedProjectRecord = {
      scope: this.stateScope,
      revision,
      state: serialized,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now
    };
    const expectedRevision = existingRecord?.revision ?? null;
    const applied = await this.saveRecord(nextRecord, expectedRevision);
    if (!applied) {
      throw new Error('Persistent native pipeline state conflict detected while saving.');
    }
  }

  private async saveRecord(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    if (canGuardRevisions(this.repository)) {
      return this.repository.saveIfRevision(record, expectedRevision);
    }
    await this.repository.save(record);
    return true;
  }

  private async withLock<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const owner = await this.acquireLockOwner();
    try {
      return await operation();
    } finally {
      await this.releaseLock(owner);
    }
  }

  private async acquireLockOwner(): Promise<string> {
    const owner = `${process.pid}-${randomUUID()}`;
    const deadline = Date.now() + this.lockAcquireTimeoutMs;
    while (Date.now() <= deadline) {
      const currentRecord = await this.repository.find(this.lockScope);
      const currentLock = parseLockState(currentRecord?.state);
      const canAttempt = !currentLock || !isLockActive(currentLock);
      if (canAttempt) {
        const now = nowIso();
        const lockRecord: PersistedProjectRecord = {
          scope: this.lockScope,
          revision: owner,
          state: {
            owner,
            expiresAt: new Date(Date.now() + this.lockTtlMs).toISOString()
          },
          createdAt: currentRecord?.createdAt ?? now,
          updatedAt: now
        };
        const expectedRevision = currentRecord?.revision ?? null;
        const applied = await this.saveRecord(lockRecord, expectedRevision);
        if (!applied) {
          await sleep(this.lockRetryMs);
          continue;
        }

        const confirmedRecord = await this.repository.find(this.lockScope);
        const confirmedLock = parseLockState(confirmedRecord?.state);
        if (confirmedLock && confirmedLock.owner === owner && isLockActive(confirmedLock)) {
          return owner;
        }
      }
      await sleep(this.lockRetryMs);
    }
    throw new Error('Timed out acquiring persistent native pipeline lock.');
  }

  private async releaseLock(owner: string): Promise<void> {
    try {
      const currentRecord = await this.repository.find(this.lockScope);
      const currentLock = parseLockState(currentRecord?.state);
      if (!currentLock || currentLock.owner !== owner) return;
      if (canGuardRevisions(this.repository) && currentRecord) {
        const now = nowIso();
        await this.repository.saveIfRevision(
          {
            scope: this.lockScope,
            revision: `${owner}:released:${now}`,
            state: {
              owner,
              expiresAt: now
            },
            createdAt: currentRecord.createdAt,
            updatedAt: now
          },
          currentRecord.revision
        );
        return;
      }
      await this.repository.remove(this.lockScope);
    } catch {
      return;
    }
  }
}
