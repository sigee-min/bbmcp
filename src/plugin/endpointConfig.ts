import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT, DEFAULT_SERVER_PATH } from '../config';
import type { Logger } from '../logging';
import { errorMessage } from '../logging';
import { loadNativeModule } from '../shared/nativeModules';
import { resolveUserConfigBaseDir } from '../shared/userConfigDir';
import type { EndpointConfig } from './types';
import { normalizeHost, normalizePath, normalizePort } from '../shared/endpoint';

type FsModule = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: string) => string;
};

type PathModule = {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
};
type OsModule = {
  homedir: () => string;
};

const readEnvConfig = (): Partial<EndpointConfig> => {
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  return {
    host: normalizeHost(env.BBMCP_HOST) ?? undefined,
    port: normalizePort(env.BBMCP_PORT) ?? undefined,
    path: env.BBMCP_PATH ? normalizePath(env.BBMCP_PATH) : undefined
  };
};

const readProjectConfig = (logger?: Logger): Partial<EndpointConfig> => {
  const fs = loadNativeModule<FsModule>('fs', { message: 'Filesystem access required', optional: true });
  const path = loadNativeModule<PathModule>('path', { message: 'Filesystem access required', optional: true });
  if (!fs || !path) return {};
  const root = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
  const filePath = path.resolve(root, '.bbmcp', 'endpoint.json');
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      host: normalizeHost(parsed.host) ?? undefined,
      port: normalizePort(parsed.port) ?? undefined,
      path: parsed.path ? normalizePath(parsed.path) : undefined
    };
  } catch (err) {
    logger?.warn('endpoint config parse failed; using defaults', {
      message: errorMessage(err)
    });
    return {};
  }
};

const readUserConfig = (logger?: Logger): Partial<EndpointConfig> => {
  const fs = loadNativeModule<FsModule>('fs', { message: 'Filesystem access required', optional: true });
  const path = loadNativeModule<PathModule>('path', { message: 'Filesystem access required', optional: true });
  const os = loadNativeModule<OsModule>('os', { message: 'Filesystem access required', optional: true });
  if (!fs || !path) return {};
  const base = resolveUserConfigBaseDir(path, os ?? null);
  if (!base) return {};
  const filePath = path.join(base.baseDir, 'endpoint.json');
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      host: normalizeHost(parsed.host) ?? undefined,
      port: normalizePort(parsed.port) ?? undefined,
      path: parsed.path ? normalizePath(parsed.path) : undefined
    };
  } catch (err) {
    logger?.warn('endpoint config parse failed; using defaults', {
      message: errorMessage(err)
    });
    return {};
  }
};

export const resolveEndpointConfig = (logger?: Logger): EndpointConfig => {
  const defaults: EndpointConfig = {
    host: DEFAULT_SERVER_HOST,
    port: DEFAULT_SERVER_PORT,
    path: DEFAULT_SERVER_PATH
  };
  const fromUser = readUserConfig(logger);
  const fromProject = readProjectConfig(logger);
  const fromEnv = readEnvConfig();
  return {
    host: fromEnv.host ?? fromUser.host ?? fromProject.host ?? defaults.host,
    port: fromEnv.port ?? fromUser.port ?? fromProject.port ?? defaults.port,
    path: fromEnv.path ?? fromUser.path ?? fromProject.path ?? defaults.path
  };
};
