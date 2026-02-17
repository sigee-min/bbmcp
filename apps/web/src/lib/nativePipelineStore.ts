import { configureNativePipelineStoreFactory, getNativePipelineStore } from '@ashfox/native-pipeline';
import { createGatewayNativePipelineStore } from '@ashfox/mcp-gateway/persistence';

configureNativePipelineStoreFactory(createGatewayNativePipelineStore);

export { getNativePipelineStore };
