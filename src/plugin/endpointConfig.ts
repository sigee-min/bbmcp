import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT, DEFAULT_SERVER_PATH } from '../config';
import type { EndpointConfig } from './types';
import { normalizeHost, normalizePath, normalizePort } from '../shared/endpoint';

const readEnvConfig = (): Partial<EndpointConfig> => {
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  return {
    host: normalizeHost(env.BBMCP_HOST) ?? undefined,
    port: normalizePort(env.BBMCP_PORT) ?? undefined,
    path: env.BBMCP_PATH ? normalizePath(env.BBMCP_PATH) : undefined
  };
};

export const resolveEndpointConfig = (): EndpointConfig => {
  const defaults: EndpointConfig = {
    host: DEFAULT_SERVER_HOST,
    port: DEFAULT_SERVER_PORT,
    path: DEFAULT_SERVER_PATH
  };
  const fromEnv = readEnvConfig();
  return {
    host: fromEnv.host ?? defaults.host,
    port: fromEnv.port ?? defaults.port,
    path: fromEnv.path ?? defaults.path
  };
};
