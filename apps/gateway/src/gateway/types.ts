import type { BackendKind } from '@ashfox/backend-core';

export interface GatewayRuntimeConfig {
  host: string;
  port: number;
  path: string;
  backend: BackendKind;
  serveWebUi: boolean;
  webDistPath?: string;
}

export interface GatewayPersistenceConfig {
  failFast: boolean;
}
