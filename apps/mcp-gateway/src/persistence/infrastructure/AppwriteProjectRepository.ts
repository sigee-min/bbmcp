import { createHash } from 'node:crypto';
import type { PersistedProjectRecord, ProjectRepository, ProjectRepositoryScope } from '@ashfox/backend-core';
import type { AppwriteDatabaseConfig } from '../config';

export interface AppwriteProjectRepositoryOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
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

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const toDocumentId = (scope: ProjectRepositoryScope): string => {
  const key = `${scope.tenantId}::${scope.projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `p${digest.slice(0, 35)}`;
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const buildError = async (response: Response, action: string): Promise<Error> => {
  const raw = (await response.text()).trim();
  if (!raw) {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText}`);
  }
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; type?: unknown; code?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : `${response.status} ${response.statusText}`;
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    const code = typeof parsed.code === 'number' || typeof parsed.code === 'string' ? String(parsed.code) : '';
    const suffix = [type, code].filter(Boolean).join('/');
    return new Error(`Appwrite ${action} failed: ${message}${suffix ? ` (${suffix})` : ''}`);
  } catch {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText} :: ${raw.slice(0, 300)}`);
  }
};

export class AppwriteProjectRepository implements ProjectRepository {
  private readonly config: AppwriteDatabaseConfig;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly documentsPath: string;

  constructor(config: AppwriteDatabaseConfig, options: AppwriteProjectRepositoryOptions = {}) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl)
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.documentsPath = `/databases/${encodeURIComponent(this.config.databaseId)}/collections/${encodeURIComponent(this.config.collectionId)}/documents`;
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { json?: unknown } = {}
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = new Headers({
        'x-appwrite-project': this.config.projectId,
        'x-appwrite-key': this.config.apiKey,
        'x-appwrite-response-format': this.config.responseFormat
      });
      let body: string | undefined;
      if (options.json !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(options.json);
      }
      return await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Appwrite request timed out after ${this.config.requestTimeoutMs}ms (${method} ${path}).`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    const response = await this.request(
      'GET',
      `${this.documentsPath}/${encodeURIComponent(documentId)}`
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await buildError(response, 'find document');
    }
    const document = (await response.json()) as AppwriteProjectDocument;
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
      throw await buildError(createResponse, 'create document');
    }

    const updateResponse = await this.request('PATCH', `${this.documentsPath}/${encodeURIComponent(documentId)}`, {
      json: {
        data: {
          revision: baseData.revision,
          stateJson: baseData.stateJson,
          updatedAt: baseData.updatedAt
        }
      }
    });
    if (!updateResponse.ok) {
      throw await buildError(updateResponse, 'update document');
    }
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    const existing = await this.find(record.scope);
    if (expectedRevision === null) {
      if (existing) return false;
      await this.save(record);
      return true;
    }
    if (!existing || existing.revision !== expectedRevision) {
      return false;
    }
    await this.save(record);
    return true;
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    const response = await this.request(
      'DELETE',
      `${this.documentsPath}/${encodeURIComponent(documentId)}`
    );
    if (response.status === 404) return;
    if (!response.ok) {
      throw await buildError(response, 'delete document');
    }
  }
}
