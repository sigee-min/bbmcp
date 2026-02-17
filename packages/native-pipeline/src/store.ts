import { NativePipelineStore, type NativePipelineStorePort } from './NativePipelineStore';

type NativePipelineGlobalStore = NativePipelineStorePort & {
  close?: () => Promise<void>;
};

export type NativePipelineStoreFactoryResult = {
  store: NativePipelineStorePort;
  close?: () => Promise<void>;
};

export type NativePipelineStoreFactory = () => NativePipelineStoreFactoryResult;

const globalState = globalThis as {
  __ashfox_native_pipeline_store__?: NativePipelineGlobalStore;
  __ashfox_native_pipeline_store_factory__?: NativePipelineStoreFactory;
};

const resolveBackend = (): 'memory' | 'persistence' => {
  const value = String(process.env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase();
  return value === 'memory' ? 'memory' : 'persistence';
};

export const configureNativePipelineStoreFactory = (factory: NativePipelineStoreFactory): void => {
  globalState.__ashfox_native_pipeline_store_factory__ = factory;
};

const createPersistentStore = (): NativePipelineGlobalStore => {
  const factory = globalState.__ashfox_native_pipeline_store_factory__;
  if (!factory) {
    throw new Error(
      'Native pipeline persistence backend is not configured. Call configureNativePipelineStoreFactory before getNativePipelineStore() when ASHFOX_NATIVE_PIPELINE_BACKEND=persistence.'
    );
  }
  const created = factory();
  return Object.assign(created.store, {
    ...(created.close ? { close: created.close } : {})
  });
};

export const getNativePipelineStore = (): NativePipelineStorePort => {
  if (!globalState.__ashfox_native_pipeline_store__) {
    globalState.__ashfox_native_pipeline_store__ =
      resolveBackend() === 'memory' ? new NativePipelineStore() : createPersistentStore();
  }
  return globalState.__ashfox_native_pipeline_store__;
};
