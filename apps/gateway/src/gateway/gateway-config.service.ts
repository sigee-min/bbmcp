import { Inject, Injectable } from '@nestjs/common';
import { normalizePath } from '@ashfox/runtime/transport/mcp/routerUtils';
import type { LogLevel } from '@ashfox/runtime/logging';
import { DEFAULT_HOST, DEFAULT_PATH, DEFAULT_SERVE_WEB_UI } from './constants';
import { resolveBackendKind, resolveBooleanFlag, resolveLogLevel, toPort } from './env';
import { GATEWAY_ENV } from './tokens';
import type { GatewayPersistenceConfig, GatewayRuntimeConfig } from './types';

@Injectable()
export class GatewayConfigService {
  readonly env: NodeJS.ProcessEnv;
  readonly runtime: GatewayRuntimeConfig;
  readonly persistence: GatewayPersistenceConfig;
  readonly logLevel: LogLevel;

  constructor(@Inject(GATEWAY_ENV) env: NodeJS.ProcessEnv) {
    this.env = env;
    this.runtime = {
      host: this.env.ASHFOX_HOST ?? DEFAULT_HOST,
      port: toPort(this.env.ASHFOX_PORT),
      path: normalizePath(this.env.ASHFOX_PATH ?? DEFAULT_PATH),
      backend: resolveBackendKind(this.env.ASHFOX_GATEWAY_BACKEND),
      serveWebUi: resolveBooleanFlag(this.env.ASHFOX_GATEWAY_SERVE_WEB_UI, DEFAULT_SERVE_WEB_UI),
      webDistPath: this.env.ASHFOX_WEB_DIST_PATH?.trim() || undefined
    };
    this.persistence = {
      failFast: resolveBooleanFlag(this.env.ASHFOX_PERSISTENCE_FAIL_FAST, true)
    };
    this.logLevel = resolveLogLevel(this.env.ASHFOX_GATEWAY_LOG_LEVEL, 'info');
  }
}
