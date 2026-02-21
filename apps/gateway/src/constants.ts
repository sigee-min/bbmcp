import type { BackendKind } from '@ashfox/backend-core';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;
export const DEFAULT_PATH = '/mcp';
export const DEFAULT_BACKEND: BackendKind = 'engine';
export const DEFAULT_SERVE_WEB_UI = true;
export const GATEWAY_VERSION = '0.0.2';
export const DEFAULT_AUTH_COOKIE_NAME = 'ashfox_access_token';
export const DEFAULT_AUTH_TOKEN_TTL_SEC = 60 * 60 * 24;
export const DEFAULT_AUTH_GITHUB_SCOPES = 'read:user user:email';
export const DEFAULT_AUTH_POST_LOGIN_REDIRECT_PATH = '/';

export const MAX_BODY_BYTES = 5_000_000;

export const API_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,last-event-id,authorization,mcp-protocol-version,mcp-session-id',
  'access-control-allow-private-network': 'true',
  'access-control-max-age': '86400',
  vary: 'origin'
} as const;

export const GLOBAL_CORS_OPTIONS = {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'content-type',
    'last-event-id',
    'authorization',
    'mcp-protocol-version',
    'mcp-session-id'
  ],
  maxAge: 86_400
};
