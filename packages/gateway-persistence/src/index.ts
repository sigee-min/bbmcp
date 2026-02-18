import type { NativePipelineStoreFactoryResult } from '@ashfox/native-pipeline';
import { PersistentNativePipelineStore } from '@ashfox/native-pipeline/persistent';
import { closeGatewayPersistence, createGatewayPersistence } from './createPersistence';

export { closeGatewayPersistence, createGatewayPersistence };

export const createGatewayNativePipelineStore = (env: NodeJS.ProcessEnv): NativePipelineStoreFactoryResult => {
  const persistence = createGatewayPersistence(env, { failFast: false });
  if (!persistence.health.database.ready) {
    throw new Error(
      `Native pipeline requires a ready database persistence provider (provider=${persistence.health.database.provider}, reason=${persistence.health.database.reason ?? 'not_ready'}).`
    );
  }

  return {
    store: new PersistentNativePipelineStore(persistence.projectRepository),
    close: async (): Promise<void> => {
      await closeGatewayPersistence(persistence);
    }
  };
};
