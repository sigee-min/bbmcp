import { createHash, randomUUID } from 'node:crypto';
import type {
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  ProjectRepositoryWithRevisionGuard
} from '@ashfox/backend-core';
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
import {
  deserializeState,
  isLockActive,
  normalizeCounter,
  parseLockState,
  serializeState
} from './persistenceState';
import { ensureProject, getProject as readProject, listProjects as readProjects, seedProjects } from './projectRepository';
import { createNativePipelineState, resetNativePipelineState, type NativePipelineState } from './state';
import type { NativeJob, NativeJobResult, NativeJobSubmitInput, NativeProjectEvent, NativeProjectSnapshot } from './types';

const DEFAULT_STATE_SCOPE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-state-v2'
};
const DEFAULT_LOCK_SCOPE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-lock-v2'
};
const DEFAULT_LOCK_TTL_MS = 2_000;
const DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_RETRY_MS = 30;

const canGuardRevisions = (repository: ProjectRepository): repository is ProjectRepository & ProjectRepositoryWithRevisionGuard =>
  typeof (repository as { saveIfRevision?: unknown }).saveIfRevision === 'function';

const nowIso = (): string => new Date().toISOString();

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
