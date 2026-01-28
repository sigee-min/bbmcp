import type { UvContextCache } from './uvContext';

export type ProxyPipelineCache = {
  uv?: UvContextCache;
};

export const createProxyPipelineCache = (): ProxyPipelineCache => ({
  uv: {}
});
