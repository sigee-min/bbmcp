import { NativePipelineStore } from './NativePipelineStore';

const globalStore = globalThis as { __ashfox_native_pipeline_store__?: NativePipelineStore };

export const getNativePipelineStore = (): NativePipelineStore => {
  if (!globalStore.__ashfox_native_pipeline_store__) {
    globalStore.__ashfox_native_pipeline_store__ = new NativePipelineStore();
  }
  return globalStore.__ashfox_native_pipeline_store__;
};

export const setNativePipelineStoreForTests = (store: NativePipelineStore): void => {
  globalStore.__ashfox_native_pipeline_store__ = store;
};

export const resetNativePipelineStoreForTests = (): void => {
  delete globalStore.__ashfox_native_pipeline_store__;
};
