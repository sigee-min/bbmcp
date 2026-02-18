import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput, ProjectRepository, ProjectRepositoryScope } from '@ashfox/backend-core';

const buildAdapterError = (domain: 'database' | 'storage', provider: string, reason: string): Error =>
  new Error(`${domain} provider "${provider}" is unavailable: ${reason}`);

export class UnsupportedProjectRepository implements ProjectRepository {
  private readonly error: Error;

  constructor(provider: string, reason: string) {
    this.error = buildAdapterError('database', provider, reason);
  }

  async find(_scope: ProjectRepositoryScope): Promise<null> {
    throw this.error;
  }

  async save(): Promise<void> {
    throw this.error;
  }

  async remove(_scope: ProjectRepositoryScope): Promise<void> {
    throw this.error;
  }
}

export class UnsupportedBlobStore implements BlobStore {
  private readonly error: Error;

  constructor(provider: string, reason: string) {
    this.error = buildAdapterError('storage', provider, reason);
  }

  async put(_input: BlobWriteInput): Promise<BlobPointer> {
    throw this.error;
  }

  async get(_pointer: BlobPointer): Promise<BlobReadResult | null> {
    throw this.error;
  }

  async delete(_pointer: BlobPointer): Promise<void> {
    throw this.error;
  }
}
