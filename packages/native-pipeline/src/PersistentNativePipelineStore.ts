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
import {
  acquireProjectLock as acquireNativeProjectLock,
  getProjectLock as readProjectLock,
  releaseExpiredProjectLocks,
  releaseProjectLock as releaseNativeProjectLock,
  releaseProjectLocksByOwner as releaseNativeProjectLocksByOwner,
  renewProjectLock as renewNativeProjectLock
} from './projectLockRepository';
import { createNativePipelineState, resetNativePipelineState, type NativePipelineState } from './state';
import type {
  NativeAcquireProjectLockInput,
  NativeCreateFolderInput,
  NativeCreateProjectInput,
  NativeJob,
  NativeJobResult,
  NativeJobSubmitInput,
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
  private cachedState: NativePipelineState | null = null;
  private cachedStateRevision: string | null = null;

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

  async getProjectTree(query?: string): Promise<NativeProjectTreeSnapshot> {
    const state = await this.readState();
    return readProjectTree(state, query);
  }

  async getProject(projectId: string): Promise<NativeProjectSnapshot | null> {
    const state = await this.readState();
    return readProject(state, projectId);
  }

  async createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder> {
    return this.withMutation((state) => createProjectFolder(state, input));
  }

  async renameFolder(folderId: string, nextName: string): Promise<NativeProjectFolder | null> {
    return this.withMutation((state) => renameProjectFolder(state, folderId, nextName));
  }

  async moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null> {
    return this.withMutation((state) => moveProjectFolder(state, input));
  }

  async deleteFolder(folderId: string): Promise<boolean> {
    return this.withMutation((state) => deleteProjectFolder(state, folderId));
  }

  async createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot> {
    return this.withMutation((state) => createProjectSnapshot(state, input, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async renameProject(projectId: string, nextName: string): Promise<NativeProjectSnapshot | null> {
    return this.withMutation((state) => renameProjectSnapshot(state, projectId, nextName, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null> {
    return this.withMutation((state) => moveProjectSnapshot(state, input, (project) => appendProjectSnapshotEvent(state, project)));
  }

  async deleteProject(projectId: string): Promise<boolean> {
    return this.withMutation((state) => deleteProjectSnapshot(state, projectId));
  }

  async getProjectLock(projectId: string): Promise<NativeProjectLock | null> {
    return this.withMutation((nextState) => {
      releaseExpiredProjectLocks(nextState, (project) => appendProjectSnapshotEvent(nextState, project));
      return readProjectLock(nextState, projectId);
    });
  }

  async acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock> {
    return this.withMutation((state) =>
      acquireNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null> {
    return this.withMutation((state) =>
      renewNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean> {
    return this.withMutation((state) =>
      releaseNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null): Promise<number> {
    return this.withMutation((state) =>
      releaseNativeProjectLocksByOwner(
        state,
        ownerAgentId,
        ownerSessionId,
        (project) => appendProjectSnapshotEvent(state, project)
      )
    );
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
        const cached = this.getCachedState(existingRecord);
        if (cached) {
          return;
        }
        const hydrated = deserializeState(existingRecord?.state);
        if (hydrated) {
          if (existingRecord) {
            this.setCachedState(existingRecord.revision, hydrated);
          }
          return;
        }
        const seeded = createNativePipelineState();
        seedProjects(seeded, (project) => appendProjectSnapshotEvent(seeded, project));
        await this.persistState(seeded, existingRecord ?? null);
      }).catch((error) => {
        this.initializationPromise = null;
        this.clearCache();
        throw error;
      });
    }
    await this.initializationPromise;
  }

  private async readState(): Promise<NativePipelineState> {
    await this.ensureInitialized();
    const record = await this.repository.find(this.stateScope);
    const cached = this.getCachedState(record);
    if (cached) {
      return cached;
    }
    const hydrated = deserializeState(record?.state);
    if (hydrated) {
      if (record) {
        this.setCachedState(record.revision, hydrated);
      }
      return hydrated;
    }

    return this.withLock(async () => {
      const latestRecord = await this.repository.find(this.stateScope);
      const latestCached = this.getCachedState(latestRecord);
      if (latestCached) {
        return latestCached;
      }
      const latestHydrated = deserializeState(latestRecord?.state);
      if (latestHydrated) {
        if (latestRecord) {
          this.setCachedState(latestRecord.revision, latestHydrated);
        }
        return latestHydrated;
      }
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
      const cached = this.getCachedState(existingRecord);
      const hydrated = cached ?? deserializeState(existingRecord?.state);
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
      this.clearCache();
      throw new Error('Persistent native pipeline state conflict detected while saving.');
    }
    this.setCachedState(revision, state);
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

  private getCachedState(record: PersistedProjectRecord | null): NativePipelineState | null {
    if (!record) {
      return null;
    }
    if (!this.cachedState || !this.cachedStateRevision) {
      return null;
    }
    if (record.revision !== this.cachedStateRevision) {
      return null;
    }
    return this.cachedState;
  }

  private setCachedState(revision: string, state: NativePipelineState): void {
    this.cachedStateRevision = revision;
    this.cachedState = state;
  }

  private clearCache(): void {
    this.cachedState = null;
    this.cachedStateRevision = null;
  }
}
