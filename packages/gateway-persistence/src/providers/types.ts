import type { BlobStore, ProjectRepository, ProviderReadiness, WorkspaceRepository } from '@ashfox/backend-core';

export type BuiltPort<TPort> = {
  port: TPort;
  readiness: ProviderReadiness;
};

export type BuiltDatabasePorts = {
  projectRepository: BuiltPort<ProjectRepository>;
  workspaceRepository: BuiltPort<WorkspaceRepository>;
};

export type BuiltBlobStore = BuiltPort<BlobStore>;
