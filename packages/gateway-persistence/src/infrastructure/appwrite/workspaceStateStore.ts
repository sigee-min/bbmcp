import { createHash } from 'node:crypto';

const CANONICAL_WORKSPACE_STATE_SCOPE = {
  tenantId: '__workspace_meta__',
  projectId: 'workspace-state'
} as const;

const DEFAULT_WORKSPACE_STATE_DOCUMENT_ID = 'workspace-state';
const LEGACY_WORKSPACE_STATE_DOCUMENT_IDS = ['workspace-state-v2', 'workspace-state-v1'] as const;
const LEGACY_WORKSPACE_STATE_SCOPES = [
  {
    tenantId: '__workspace_meta_v2__',
    projectId: 'workspace-state-v2'
  },
  {
    tenantId: '__workspace_meta__',
    projectId: 'workspace-state-v1'
  }
] as const;

type WorkspaceStateDocument = Partial<{
  tenantId: string;
  projectId: string;
  revision: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
  $createdAt: string;
  $updatedAt: string;
}>;

type WorkspaceStateDocumentPayload = {
  tenantId: string;
  projectId: string;
  revision: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceStateRecord = {
  revision: string;
  state: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AppwriteWorkspaceStateStoreAdapter = {
  readDocument: (documentId: string) => Promise<WorkspaceStateDocument | null>;
  upsertDocument: (documentId: string, data: WorkspaceStateDocumentPayload) => Promise<void>;
};

const normalizeTimestamp = (value: unknown): string => {
  const parsed = new Date(typeof value === 'string' ? value : '');
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const isKnownWorkspaceStateScope = (tenantId: unknown, projectId: unknown): boolean => {
  if (tenantId === CANONICAL_WORKSPACE_STATE_SCOPE.tenantId && projectId === CANONICAL_WORKSPACE_STATE_SCOPE.projectId) {
    return true;
  }
  return LEGACY_WORKSPACE_STATE_SCOPES.some((scope) => scope.tenantId === tenantId && scope.projectId === projectId);
};

export const toWorkspaceStateRevision = (state: unknown): string =>
  createHash('sha256').update(JSON.stringify(state)).digest('hex');

export class AppwriteWorkspaceStateStore {
  private readonly adapter: AppwriteWorkspaceStateStoreAdapter;
  private readonly writeDocumentId: string;
  private readonly readDocumentIds: readonly string[];

  constructor(adapter: AppwriteWorkspaceStateStoreAdapter, documentId: string = DEFAULT_WORKSPACE_STATE_DOCUMENT_ID) {
    this.adapter = adapter;
    this.writeDocumentId = documentId;
    this.readDocumentIds = [documentId, ...LEGACY_WORKSPACE_STATE_DOCUMENT_IDS].filter(
      (candidate, index, candidates) => candidates.indexOf(candidate) === index
    );
  }

  async read(): Promise<WorkspaceStateRecord | null> {
    for (const documentId of this.readDocumentIds) {
      const document = await this.adapter.readDocument(documentId);
      if (!document) {
        continue;
      }
      if (!isKnownWorkspaceStateScope(document.tenantId, document.projectId)) {
        continue;
      }
      const state = parseState(document.stateJson);
      if (state === null) {
        continue;
      }
      return {
        revision: String(document.revision ?? ''),
        state,
        createdAt: normalizeTimestamp(document.createdAt ?? document.$createdAt),
        updatedAt: normalizeTimestamp(document.updatedAt ?? document.$updatedAt)
      };
    }
    return null;
  }

  async write(state: unknown): Promise<WorkspaceStateRecord> {
    const serialized = JSON.stringify(state);
    const revision = toWorkspaceStateRevision(state);
    const existing = await this.read();
    const now = new Date().toISOString();
    const payload: WorkspaceStateDocumentPayload = {
      tenantId: CANONICAL_WORKSPACE_STATE_SCOPE.tenantId,
      projectId: CANONICAL_WORKSPACE_STATE_SCOPE.projectId,
      revision,
      stateJson: serialized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.adapter.upsertDocument(this.writeDocumentId, payload);
    return {
      revision,
      state,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt
    };
  }
}
