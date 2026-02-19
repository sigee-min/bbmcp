import type { BackendKind } from '@ashfox/backend-core';

export interface GatewayRuntimeConfig {
  host: string;
  port: number;
  path: string;
  backend: BackendKind;
  serveWebUi: boolean;
  webDistPath?: string;
  auth: GatewayAuthConfig;
}

export interface GatewayPersistenceConfig {
  failFast: boolean;
}

export interface GatewayAuthConfig {
  jwtSecret: string;
  tokenTtlSec: number;
  cookieName: string;
  cookieSecure: boolean;
  githubClientId?: string;
  githubClientSecret?: string;
  githubCallbackUrl?: string;
  githubScopes: string;
  postLoginRedirectPath: string;
}
