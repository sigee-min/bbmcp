import { createHash, randomUUID } from 'node:crypto';
import type { PersistedProjectRecord, ProjectRepository, ProjectRepositoryScope } from '@ashfox/backend-core';
import type { AppwriteDatabaseConfig } from '../config';
import { createAppwriteTransport } from './appwrite/transport';

export interface AppwriteProjectRepositoryOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  lockTtlMs?: number;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

type ProjectDocumentData = {
  tenantId: string;
  projectId: string;
  revision: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
};

type AppwriteProjectDocument = Partial<ProjectDocumentData> & {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
};

type AppwriteProjectLockState = {
  owner: string;
  expiresAt: string;
};

const DEFAULT_LOCK_TTL_MS = 15000;
const DEFAULT_LOCK_TIMEOUT_MS = 10000;
const DEFAULT_LOCK_RETRY_MS = 25;

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return normalized;
};

const normalizeTimestamp = (value: unknown): string => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const toDocumentId = (scope: ProjectRepositoryScope): string => {
  const key = `${scope.tenantId}::${scope.projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `p${digest.slice(0, 35)}`;
};

const toLockDocumentId = (scope: ProjectRepositoryScope): string => {
  const key = `${scope.tenantId}::${scope.projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `l${digest.slice(0, 35)}`;
};

const resolvePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const next = Math.trunc(value);
  return next > 0 ? next : fallback;
};

const parseLockState = (document: AppwriteProjectDocument | null): AppwriteProjectLockState | null => {
  if (!document) return null;
  const state = parseState(document.stateJson);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const owner = (state as { owner?: unknown }).owner;
  const expiresAt = (state as { expiresAt?: unknown }).expiresAt;
  if (typeof owner !== 'string' || typeof expiresAt !== 'string') return null;
  return {
    owner,
    expiresAt
  };
};

const isExpired = (expiresAt: string): boolean => {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= Date.now();
};

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export class AppwriteProjectRepository implements ProjectRepository {
  private readonly config: AppwriteDatabaseConfig;
  private readonly transport: ReturnType<typeof createAppwriteTransport<AppwriteDatabaseConfig>>;
  private readonly documentsPath: string;
  private readonly lockTtlMs: number;
  private readonly lockTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly sleepImpl: (delayMs: number) => Promise<void>;

  constructor(config: AppwriteDatabaseConfig, options: AppwriteProjectRepositoryOptions = {}) {
    this.transport = createAppwriteTransport(config, { fetchImpl: options.fetchImpl });
    this.config = this.transport.config;
    this.lockTtlMs = resolvePositiveInt(options.lockTtlMs, DEFAULT_LOCK_TTL_MS);
    this.lockTimeoutMs = resolvePositiveInt(options.lockTimeoutMs, DEFAULT_LOCK_TIMEOUT_MS);
    this.lockRetryMs = resolvePositiveInt(options.lockRetryMs, DEFAULT_LOCK_RETRY_MS);
    this.sleepImpl = options.sleepImpl ?? sleep;
    this.documentsPath = `/databases/${encodeURIComponent(this.config.databaseId)}/collections/${encodeURIComponent(this.config.collectionId)}/documents`;
  }

  private toDocumentPath(documentId: string): string {
    return `${this.documentsPath}/${encodeURIComponent(documentId)}`;
  }

  private async readDocument(documentId: string, action: string): Promise<AppwriteProjectDocument | null> {
    const response = await this.request('GET', this.toDocumentPath(documentId));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await this.transport.toError(response, action);
    }
    return (await response.json()) as AppwriteProjectDocument;
  }

  private async deleteDocument(documentId: string, action: string): Promise<void> {
    const response = await this.request('DELETE', this.toDocumentPath(documentId));
    if (response.status === 404) return;
    if (!response.ok) {
      throw await this.transport.toError(response, action);
    }
  }

  private async acquireScopeLock(scope: ProjectRepositoryScope): Promise<{ lockDocumentId: string; owner: string }> {
    const lockDocumentId = toLockDocumentId(scope);
    const owner = `${process.pid}-${randomUUID()}`;
    const lockTenantId = `__lock__:${scope.tenantId}`;
    const deadline = Date.now() + this.lockTimeoutMs;

    while (Date.now() <= deadline) {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.lockTtlMs).toISOString();
      const createResponse = await this.request('POST', this.documentsPath, {
        json: {
          documentId: lockDocumentId,
          data: {
            tenantId: lockTenantId,
            projectId: scope.projectId,
            revision: owner,
            stateJson: JSON.stringify({ owner, expiresAt }),
            createdAt: now,
            updatedAt: now
          }
        }
      });

      if (createResponse.ok) {
        return { lockDocumentId, owner };
      }

      if (createResponse.status !== 409) {
        throw await this.transport.toError(createResponse, 'acquire lock');
      }

      const existingLockDocument = await this.readDocument(lockDocumentId, 'read lock');
      const lockState = parseLockState(existingLockDocument);
      if (!lockState || isExpired(lockState.expiresAt)) {
        await this.deleteDocument(lockDocumentId, 'delete stale lock');
      }
      await this.sleepImpl(this.lockRetryMs);
    }

    throw new Error(`Appwrite lock acquisition timed out after ${this.lockTimeoutMs}ms.`);
  }

  private async releaseScopeLock(scope: ProjectRepositoryScope, owner: string): Promise<void> {
    const lockDocumentId = toLockDocumentId(scope);
    const existingLockDocument = await this.readDocument(lockDocumentId, 'read lock before release');
    const lockState = parseLockState(existingLockDocument);
    if (!lockState || lockState.owner !== owner) {
      return;
    }
    await this.deleteDocument(lockDocumentId, 'release lock');
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { json?: unknown } = {}
  ): Promise<Response> {
    return this.transport.request(method, path, options);
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    const document = await this.readDocument(documentId, 'find document');
    if (!document) return null;
    if (document.tenantId !== normalizedScope.tenantId || document.projectId !== normalizedScope.projectId) {
      throw new Error(
        `Appwrite document scope mismatch for tenant="${normalizedScope.tenantId}" project="${normalizedScope.projectId}".`
      );
    }
    return {
      scope: normalizedScope,
      revision: normalizeRequired(String(document.revision ?? ''), 'revision'),
      state: parseState(document.stateJson),
      createdAt: normalizeTimestamp(document.createdAt ?? document.$createdAt),
      updatedAt: normalizeTimestamp(document.updatedAt ?? document.$updatedAt)
    };
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    const normalizedScope = {
      tenantId: normalizeRequired(record.scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(record.scope.projectId, 'projectId')
    };
    const normalizedRecord: PersistedProjectRecord = {
      ...record,
      scope: normalizedScope,
      revision: normalizeRequired(record.revision, 'revision'),
      createdAt: normalizeTimestamp(record.createdAt),
      updatedAt: normalizeTimestamp(record.updatedAt)
    };
    const documentId = toDocumentId(normalizedRecord.scope);
    const baseData: ProjectDocumentData = {
      tenantId: normalizedRecord.scope.tenantId,
      projectId: normalizedRecord.scope.projectId,
      revision: normalizedRecord.revision,
      stateJson: JSON.stringify(normalizedRecord.state),
      createdAt: normalizedRecord.createdAt,
      updatedAt: normalizedRecord.updatedAt
    };

    const createResponse = await this.request('POST', this.documentsPath, {
      json: {
        documentId,
        data: baseData
      }
    });
    if (createResponse.ok) return;

    if (createResponse.status !== 409) {
      throw await this.transport.toError(createResponse, 'create document');
    }

    const updateResponse = await this.request('PATCH', this.toDocumentPath(documentId), {
      json: {
        data: {
          revision: baseData.revision,
          stateJson: baseData.stateJson,
          updatedAt: baseData.updatedAt
        }
      }
    });
    if (!updateResponse.ok) {
      throw await this.transport.toError(updateResponse, 'update document');
    }
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    const normalizedScope = {
      tenantId: normalizeRequired(record.scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(record.scope.projectId, 'projectId')
    };
    const lock = await this.acquireScopeLock(normalizedScope);
    try {
      const existing = await this.find(normalizedScope);
      if (expectedRevision === null) {
        if (existing) return false;
      } else if (!existing || existing.revision !== expectedRevision) {
        return false;
      }
      await this.save({
        ...record,
        scope: normalizedScope
      });
      return true;
    } finally {
      await this.releaseScopeLock(normalizedScope, lock.owner).catch(() => undefined);
    }
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    await this.deleteDocument(documentId, 'delete document');
  }
}
