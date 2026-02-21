import type { PersistencePorts, ProviderReadiness } from '@ashfox/backend-core';
import type { BuiltDatabasePorts } from './types';

export const mergeDatabaseReadiness = (databasePorts: BuiltDatabasePorts): ProviderReadiness =>
  databasePorts.projectRepository.readiness.ready && databasePorts.workspaceRepository.readiness.ready
    ? databasePorts.projectRepository.readiness
    : {
        ...databasePorts.projectRepository.readiness,
        ready: false,
        reason:
          databasePorts.projectRepository.readiness.reason ??
          databasePorts.workspaceRepository.readiness.reason ??
          'workspace_repository_unavailable',
        details: {
          ...(databasePorts.projectRepository.readiness.details ?? {}),
          workspace: databasePorts.workspaceRepository.readiness
        }
      };

export const buildReadinessError = (domain: 'database' | 'storage', readiness: ProviderReadiness): string => {
  const reason = readiness.reason ?? 'not_ready';
  const details = readiness.details ? ` details=${JSON.stringify(readiness.details)}` : '';
  return `${domain} provider "${readiness.provider}" failed readiness (${reason}).${details}`;
};

export const assertGatewayPersistenceReady = (persistence: PersistencePorts): void => {
  const failures: string[] = [];
  if (!persistence.health.database.ready) {
    failures.push(buildReadinessError('database', persistence.health.database));
  }
  if (!persistence.health.storage.ready) {
    failures.push(buildReadinessError('storage', persistence.health.storage));
  }
  if (failures.length > 0) {
    throw new Error(`Persistence startup validation failed: ${failures.join(' ')}`);
  }
};
