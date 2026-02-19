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

const DEFAULT_WORKSPACE_ID = 'ws_default';
const DEFAULT_STATE_SCOPE_BASE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-state-v3'
};
const DEFAULT_LOCK_SCOPE_BASE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-lock-v3'
};
const LEGACY_DEFAULT_STATE_SCOPE: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-state-v2'
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

const normalizeWorkspaceId = (workspaceId?: string): string => {
  if (typeof workspaceId !== 'string') {
    return DEFAULT_WORKSPACE_ID;
  }
  const normalized = workspaceId.trim();
  return normalized.length > 0 ? normalized : DEFAULT_WORKSPACE_ID;
};

const toWorkspaceScope = (base: ProjectRepositoryScope, workspaceId: string): ProjectRepositoryScope => ({
  tenantId: base.tenantId,
  projectId: `${base.projectId}:${workspaceId}`
});

type CachedWorkspaceState = {
  revision: string;
  state: NativePipelineState;
};

export interface PersistentNativePipelineStoreOptions {
  stateScope?: ProjectRepositoryScope;
  lockScope?: ProjectRepositoryScope;
  lockTtlMs?: number;
  lockAcquireTimeoutMs?: number;
  lockRetryMs?: number;
}

export class PersistentNativePipelineStore implements NativePipelineStorePort {
  private readonly stateScopeBase: ProjectRepositoryScope;
  private readonly lockScopeBase: ProjectRepositoryScope;
  private readonly lockTtlMs: number;
  private readonly lockAcquireTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly initializationPromises = new Map<string, Promise<void>>();
  private readonly cachedStates = new Map<string, CachedWorkspaceState>();
  private readonly knownWorkspaceIds = new Set<string>([DEFAULT_WORKSPACE_ID]);

  constructor(
    private readonly repository: ProjectRepository,
    options: PersistentNativePipelineStoreOptions = {}
  ) {
    this.stateScopeBase = options.stateScope ?? DEFAULT_STATE_SCOPE_BASE;
    this.lockScopeBase = options.lockScope ?? DEFAULT_LOCK_SCOPE_BASE;
    this.lockTtlMs = normalizeCounter(options.lockTtlMs, DEFAULT_LOCK_TTL_MS);
    this.lockAcquireTimeoutMs = normalizeCounter(options.lockAcquireTimeoutMs, DEFAULT_LOCK_ACQUIRE_TIMEOUT_MS);
    this.lockRetryMs = normalizeCounter(options.lockRetryMs, DEFAULT_LOCK_RETRY_MS);
  }

  async reset(workspaceId?: string): Promise<void> {
    const targetWorkspaceId = workspaceId ? this.resolveWorkspaceId(workspaceId) : null;
    if (targetWorkspaceId) {
      await this.withMutation(targetWorkspaceId, (state) => {
        resetNativePipelineState(state);
        this.seedWorkspace(state, targetWorkspaceId);
      });
      return;
    }
    const workspaceIds = Array.from(this.knownWorkspaceIds.values());
    for (const workspace of workspaceIds) {
      await this.withMutation(workspace, (state) => {
        resetNativePipelineState(state);
        this.seedWorkspace(state, workspace);
      });
    }
  }

  async listProjects(query?: string, workspaceId?: string): Promise<NativeProjectSnapshot[]> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProjects(state, query);
  }

  async getProjectTree(query?: string, workspaceId?: string): Promise<NativeProjectTreeSnapshot> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProjectTree(state, query);
  }

  async getProject(projectId: string, workspaceId?: string): Promise<NativeProjectSnapshot | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProject(state, projectId);
  }

  async createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) => createProjectFolder(state, input));
  }

  async renameFolder(folderId: string, nextName: string, workspaceId?: string): Promise<NativeProjectFolder | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) => renameProjectFolder(state, folderId, nextName));
  }

  async moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) => moveProjectFolder(state, input));
  }

  async deleteFolder(folderId: string, workspaceId?: string): Promise<boolean> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) => deleteProjectFolder(state, folderId));
  }

  async createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      createProjectSnapshot(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async renameProject(projectId: string, nextName: string, workspaceId?: string): Promise<NativeProjectSnapshot | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) =>
      renameProjectSnapshot(state, projectId, nextName, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      moveProjectSnapshot(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async deleteProject(projectId: string, workspaceId?: string): Promise<boolean> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) => deleteProjectSnapshot(state, projectId));
  }

  async getProjectLock(projectId: string, workspaceId?: string): Promise<NativeProjectLock | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProjectLock(state, projectId);
  }

  async acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      acquireNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      renewNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      releaseNativeProjectLock(state, input, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null, workspaceId?: string): Promise<number> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) =>
      releaseNativeProjectLocksByOwner(
        state,
        ownerAgentId,
        ownerSessionId,
        (project) => appendProjectSnapshotEvent(state, project)
      )
    );
  }

  async listProjectJobs(projectId: string, workspaceId?: string): Promise<NativeJob[]> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProjectJobs(state, projectId);
  }

  async getJob(jobId: string, workspaceId?: string): Promise<NativeJob | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readJob(state, jobId);
  }

  async submitJob(input: NativeJobSubmitInput): Promise<NativeJob> {
    const workspaceId = this.resolveWorkspaceId(input.workspaceId);
    return this.withMutation(workspaceId, (state) =>
      submitNativeJob(
        state,
        input,
        (projectId) => ensureProject(state, projectId, (project) => appendProjectSnapshotEvent(state, project), workspaceId),
        (project) => appendProjectSnapshotEvent(state, project)
      )
    );
  }

  async claimNextJob(workerId: string, workspaceId?: string): Promise<NativeJob | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) =>
      claimNativeJob(state, workerId, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async completeJob(jobId: string, result?: NativeJobResult, workspaceId?: string): Promise<NativeJob | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) =>
      completeNativeJob(state, jobId, result, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async failJob(jobId: string, error: string, workspaceId?: string): Promise<NativeJob | null> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    return this.withMutation(normalizedWorkspaceId, (state) =>
      failNativeJob(state, jobId, error, (project) => appendProjectSnapshotEvent(state, project))
    );
  }

  async getProjectEventsSince(projectId: string, lastSeq: number, workspaceId?: string): Promise<NativeProjectEvent[]> {
    const normalizedWorkspaceId = this.resolveWorkspaceId(workspaceId);
    const state = await this.readState(normalizedWorkspaceId);
    this.runLockMaintenance(state);
    return readProjectEventsSince(state, projectId, lastSeq);
  }

  private resolveWorkspaceId(workspaceId?: string): string {
    const normalized = normalizeWorkspaceId(workspaceId);
    this.knownWorkspaceIds.add(normalized);
    return normalized;
  }

  private getStateScope(workspaceId: string): ProjectRepositoryScope {
    return toWorkspaceScope(this.stateScopeBase, workspaceId);
  }

  private getLockScope(workspaceId: string): ProjectRepositoryScope {
    return toWorkspaceScope(this.lockScopeBase, workspaceId);
  }

  private seedWorkspace(state: NativePipelineState, workspaceId: string): void {
    seedProjects(state, (project) => appendProjectSnapshotEvent(state, project), workspaceId);
  }

  private ensureWorkspaceProjectTag(state: NativePipelineState, workspaceId: string): boolean {
    let changed = false;
    for (const project of state.projects.values()) {
      if (project.workspaceId === workspaceId) {
        continue;
      }
      project.workspaceId = workspaceId;
      changed = true;
    }
    return changed;
  }

  private async ensureInitialized(workspaceId: string): Promise<void> {
    if (!this.initializationPromises.has(workspaceId)) {
      const initialization = this.withWorkspaceLock(workspaceId, async () => {
        const stateScope = this.getStateScope(workspaceId);
        let existingRecord = await this.repository.find(stateScope);
        if (!existingRecord && workspaceId === DEFAULT_WORKSPACE_ID) {
          const legacyRecord = await this.repository.find(LEGACY_DEFAULT_STATE_SCOPE);
          if (legacyRecord) {
            const migrated = deserializeState(legacyRecord.state);
            if (migrated) {
              this.ensureWorkspaceProjectTag(migrated, workspaceId);
              await this.persistState(workspaceId, migrated, null);
              existingRecord = await this.repository.find(stateScope);
            }
          }
        }
        const cached = this.getCachedState(workspaceId, existingRecord);
        if (cached) {
          return;
        }
        const hydrated = deserializeState(existingRecord?.state);
        if (hydrated) {
          const tagged = this.ensureWorkspaceProjectTag(hydrated, workspaceId);
          if (tagged && existingRecord) {
            await this.persistState(workspaceId, hydrated, existingRecord);
            return;
          }
          if (existingRecord) {
            this.setCachedState(workspaceId, existingRecord.revision, hydrated);
          }
          return;
        }
        const seeded = createNativePipelineState(workspaceId);
        this.seedWorkspace(seeded, workspaceId);
        await this.persistState(workspaceId, seeded, existingRecord ?? null);
      }).catch((error) => {
        this.initializationPromises.delete(workspaceId);
        this.clearCache(workspaceId);
        throw error;
      });
      this.initializationPromises.set(workspaceId, initialization);
    }
    await this.initializationPromises.get(workspaceId);
  }

  private async readState(workspaceId: string): Promise<NativePipelineState> {
    await this.ensureInitialized(workspaceId);
    const stateScope = this.getStateScope(workspaceId);
    const record = await this.repository.find(stateScope);
    const cached = this.getCachedState(workspaceId, record);
    if (cached) {
      return cached;
    }
    const hydrated = deserializeState(record?.state);
    if (hydrated) {
      const tagged = this.ensureWorkspaceProjectTag(hydrated, workspaceId);
      if (tagged) {
        await this.persistState(workspaceId, hydrated, record ?? null);
        return hydrated;
      }
      if (record) {
        this.setCachedState(workspaceId, record.revision, hydrated);
      }
      return hydrated;
    }

    return this.withWorkspaceLock(workspaceId, async () => {
      const latestRecord = await this.repository.find(stateScope);
      const latestCached = this.getCachedState(workspaceId, latestRecord);
      if (latestCached) {
        return latestCached;
      }
      const latestHydrated = deserializeState(latestRecord?.state);
      if (latestHydrated) {
        const tagged = this.ensureWorkspaceProjectTag(latestHydrated, workspaceId);
        if (tagged) {
          await this.persistState(workspaceId, latestHydrated, latestRecord ?? null);
          return latestHydrated;
        }
        if (latestRecord) {
          this.setCachedState(workspaceId, latestRecord.revision, latestHydrated);
        }
        return latestHydrated;
      }
      const seeded = createNativePipelineState(workspaceId);
      this.seedWorkspace(seeded, workspaceId);
      await this.persistState(workspaceId, seeded, latestRecord ?? null);
      return seeded;
    });
  }

  private async withMutation<TResult>(workspaceId: string, mutator: (state: NativePipelineState) => TResult): Promise<TResult> {
    await this.ensureInitialized(workspaceId);
    return this.withWorkspaceLock(workspaceId, async () => {
      const stateScope = this.getStateScope(workspaceId);
      const existingRecord = await this.repository.find(stateScope);
      const cached = this.getCachedState(workspaceId, existingRecord);
      const hydrated = cached ?? deserializeState(existingRecord?.state);
      const state = hydrated ?? createNativePipelineState(workspaceId);
      if (!hydrated) {
        this.seedWorkspace(state, workspaceId);
      } else {
        this.ensureWorkspaceProjectTag(state, workspaceId);
      }
      const result = mutator(state);
      await this.persistState(workspaceId, state, existingRecord ?? null);
      return result;
    });
  }

  private runLockMaintenance(state: NativePipelineState): void {
    releaseExpiredProjectLocks(state, (project) => appendProjectSnapshotEvent(state, project));
  }

  private async persistState(
    workspaceId: string,
    state: NativePipelineState,
    existingRecord: PersistedProjectRecord | null
  ): Promise<void> {
    const serialized = serializeState(state);
    const serializedJson = JSON.stringify(serialized);
    const revision = createHash('sha256').update(serializedJson).digest('hex');
    const now = nowIso();
    const nextRecord: PersistedProjectRecord = {
      scope: this.getStateScope(workspaceId),
      revision,
      state: serialized,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now
    };
    const expectedRevision = existingRecord?.revision ?? null;
    const applied = await this.saveRecord(nextRecord, expectedRevision);
    if (!applied) {
      this.clearCache(workspaceId);
      throw new Error('Persistent native pipeline state conflict detected while saving.');
    }
    this.setCachedState(workspaceId, revision, state);
  }

  private async saveRecord(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    if (canGuardRevisions(this.repository)) {
      return this.repository.saveIfRevision(record, expectedRevision);
    }
    await this.repository.save(record);
    return true;
  }

  private async withWorkspaceLock<TResult>(workspaceId: string, operation: () => Promise<TResult>): Promise<TResult> {
    const owner = await this.acquireLockOwner(workspaceId);
    try {
      return await operation();
    } finally {
      await this.releaseLock(workspaceId, owner);
    }
  }

  private async acquireLockOwner(workspaceId: string): Promise<string> {
    const owner = `${process.pid}-${randomUUID()}`;
    const lockScope = this.getLockScope(workspaceId);
    const deadline = Date.now() + this.lockAcquireTimeoutMs;
    while (Date.now() <= deadline) {
      const currentRecord = await this.repository.find(lockScope);
      const currentLock = parseLockState(currentRecord?.state);
      const canAttempt = !currentLock || !isLockActive(currentLock);
      if (canAttempt) {
        const now = nowIso();
        const lockRecord: PersistedProjectRecord = {
          scope: lockScope,
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

        const confirmedRecord = await this.repository.find(lockScope);
        const confirmedLock = parseLockState(confirmedRecord?.state);
        if (confirmedLock && confirmedLock.owner === owner && isLockActive(confirmedLock)) {
          return owner;
        }
      }
      await sleep(this.lockRetryMs);
    }
    throw new Error('Timed out acquiring persistent native pipeline lock.');
  }

  private async releaseLock(workspaceId: string, owner: string): Promise<void> {
    const lockScope = this.getLockScope(workspaceId);
    try {
      const currentRecord = await this.repository.find(lockScope);
      const currentLock = parseLockState(currentRecord?.state);
      if (!currentLock || currentLock.owner !== owner) return;
      if (canGuardRevisions(this.repository) && currentRecord) {
        const now = nowIso();
        await this.repository.saveIfRevision(
          {
            scope: lockScope,
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
      await this.repository.remove(lockScope);
    } catch {
      return;
    }
  }

  private getCachedState(workspaceId: string, record: PersistedProjectRecord | null): NativePipelineState | null {
    if (!record) {
      return null;
    }
    const cached = this.cachedStates.get(workspaceId);
    if (!cached) {
      return null;
    }
    if (record.revision !== cached.revision) {
      return null;
    }
    return cached.state;
  }

  private setCachedState(workspaceId: string, revision: string, state: NativePipelineState): void {
    this.cachedStates.set(workspaceId, { revision, state });
  }

  private clearCache(workspaceId?: string): void {
    if (!workspaceId) {
      this.cachedStates.clear();
      return;
    }
    this.cachedStates.delete(workspaceId);
  }
}
