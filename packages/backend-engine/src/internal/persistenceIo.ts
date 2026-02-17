import type { PersistedProjectRecord, PersistencePorts, ProjectRepositoryScope } from '@ashfox/backend-core';
import { backendToolError } from '@ashfox/backend-core';
import type { ToolResponse } from '@ashfox/contracts/types/internal';

export type PendingWrite = {
  path: string;
  contents: string;
};

const EXPORT_BUCKET = 'exports';

const sanitizeBlobPath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');

const toExportBlobPointer = (scope: ProjectRepositoryScope, path: string) => ({
  bucket: EXPORT_BUCKET,
  key: `${scope.tenantId}/${scope.projectId}/${sanitizeBlobPath(path) || 'export.json'}`
});

export const flushPendingWrites = async (params: {
  persistence?: PersistencePorts;
  scope: ProjectRepositoryScope;
  writes: PendingWrite[];
  backend: string;
}): Promise<ToolResponse<never> | null> => {
  const { persistence, scope, writes, backend } = params;
  if (!persistence || writes.length === 0) return null;
  try {
    for (const write of writes) {
      const pointer = toExportBlobPointer(scope, write.path);
      await persistence.blobStore.put({
        ...pointer,
        bytes: Buffer.from(write.contents, 'utf8'),
        contentType: 'application/json'
      });
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return backendToolError(
      'io_error',
      `Failed to write export artifacts: ${message}`,
      'Check blob storage connectivity and retry export.',
      { backend, scope }
    );
  }
};

export const persistProjectState = async (params: {
  persistence?: PersistencePorts;
  scope: ProjectRepositoryScope;
  existing: PersistedProjectRecord | null;
  revision: string;
  hasProjectData: boolean;
  state: unknown;
  backend: string;
}): Promise<ToolResponse<never> | null> => {
  const { persistence, scope, existing, revision, hasProjectData, state, backend } = params;
  if (!persistence) return null;
  const now = new Date().toISOString();
  try {
    if (!hasProjectData) {
      await persistence.projectRepository.remove(scope);
      return null;
    }
    await persistence.projectRepository.save({
      scope,
      revision,
      state,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return backendToolError(
      'io_error',
      `Failed to persist project state: ${message}`,
      'Check persistence repository and retry.',
      { backend, scope }
    );
  }
};
