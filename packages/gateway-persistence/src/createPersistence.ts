import type { PersistencePorts } from '@ashfox/backend-core';
import { resolvePersistenceSelection } from './config';
import { createDatabasePorts } from './providers/database';
import { assertGatewayPersistenceReady, mergeDatabaseReadiness } from './providers/readiness';
import { assertNodeRuntimePreflight } from './providers/runtime';
import { createBlobStore } from './providers/storage';

export interface CreateGatewayPersistenceOptions {
  failFast?: boolean;
}

type Closable = {
  close?: () => Promise<void> | void;
};

const closeIfSupported = async (candidate: unknown): Promise<void> => {
  const close = (candidate as Closable | null | undefined)?.close;
  if (typeof close !== 'function') return;
  await close.call(candidate);
};

export const closeGatewayPersistence = async (persistence: PersistencePorts): Promise<void> => {
  const errors: string[] = [];
  const candidates = Array.from(
    new Set<unknown>([persistence.projectRepository, persistence.workspaceRepository, persistence.blobStore])
  );
  for (const candidate of candidates) {
    try {
      await closeIfSupported(candidate);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      } else {
        errors.push(String(error));
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`One or more persistence resources failed to close: ${errors.join(' | ')}`);
  }
};

export const createGatewayPersistence = (
  env: NodeJS.ProcessEnv,
  options: CreateGatewayPersistenceOptions = {}
): PersistencePorts => {
  assertNodeRuntimePreflight();

  const selection = resolvePersistenceSelection(env);
  const databasePorts = createDatabasePorts(selection, env);
  const blobStore = createBlobStore(selection, env);

  const persistence: PersistencePorts = {
    projectRepository: databasePorts.projectRepository.port,
    workspaceRepository: databasePorts.workspaceRepository.port,
    blobStore: blobStore.port,
    health: {
      selection,
      database: mergeDatabaseReadiness(databasePorts),
      storage: blobStore.readiness
    }
  };

  if (options.failFast) {
    assertGatewayPersistenceReady(persistence);
  }
  return persistence;
};
