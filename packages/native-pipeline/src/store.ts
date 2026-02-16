import { closeGatewayPersistence, createGatewayPersistence } from '../../../apps/mcp-gateway/src/persistence/createPersistence';
import { NativePipelineStore, type NativePipelineStorePort } from './NativePipelineStore';
import { PersistentNativePipelineStore } from './PersistentNativePipelineStore';

type NativePipelineGlobalStore = NativePipelineStorePort & {
  close?: () => Promise<void>;
};

const globalStore = globalThis as { __ashfox_native_pipeline_store__?: NativePipelineGlobalStore };

const resolveBackend = (): 'memory' | 'persistence' => {
  const value = String(process.env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase();
  return value === 'memory' ? 'memory' : 'persistence';
};

const createPersistentStore = (): NativePipelineGlobalStore => {
  const persistence = createGatewayPersistence(process.env, { failFast: false });
  if (!persistence.health.database.ready) {
    throw new Error(
      `Native pipeline requires a ready database persistence provider (provider=${persistence.health.database.provider}, reason=${persistence.health.database.reason ?? 'not_ready'}).`
    );
  }
  const store = new PersistentNativePipelineStore(persistence.projectRepository);
  return Object.assign(store, {
    close: async (): Promise<void> => {
      await closeGatewayPersistence(persistence);
    }
  });
};

export const getNativePipelineStore = (): NativePipelineStorePort => {
  if (!globalStore.__ashfox_native_pipeline_store__) {
    globalStore.__ashfox_native_pipeline_store__ =
      resolveBackend() === 'memory' ? new NativePipelineStore() : createPersistentStore();
  }
  return globalStore.__ashfox_native_pipeline_store__;
};

export const setNativePipelineStoreForTests = (store: NativePipelineStorePort): void => {
  globalStore.__ashfox_native_pipeline_store__ = store;
};

export const resetNativePipelineStoreForTests = async (): Promise<void> => {
  if (globalStore.__ashfox_native_pipeline_store__) {
    await globalStore.__ashfox_native_pipeline_store__.close?.();
  }
  delete globalStore.__ashfox_native_pipeline_store__;
};
