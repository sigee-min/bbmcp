import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConsoleLogger, errorMessage } from '@ashfox/runtime/logging';
import { AppModule } from './app.module';
import { API_CORS_HEADERS, GLOBAL_CORS_OPTIONS, MAX_BODY_BYTES } from './constants';
import { GatewayExceptionFilter } from './filters/gateway-exception.filter';
import { GatewayRuntimeService } from './services/gateway-runtime.service';
import { AuthService } from './services/auth.service';
import { ServiceManagementService } from './services/service-management.service';

const toLoggableError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return { error: String(error) };
};

const resolveWebDistPath = (cwd: string, configuredPath?: string): string | null => {
  if (configuredPath) {
    return path.resolve(cwd, configuredPath);
  }
  const candidates = [path.resolve(cwd, 'apps/web/dist'), path.resolve(cwd, '../web/dist')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? null;
};

const registerWebUiHosting = async (app: NestFastifyApplication, runtime: GatewayRuntimeService): Promise<void> => {
  if (!runtime.config.serveWebUi) {
    runtime.logger.info('ashfox web ui hosting disabled', {
      reason: 'ASHFOX_GATEWAY_SERVE_WEB_UI=false'
    });
    return;
  }

  const webDistPath = resolveWebDistPath(process.cwd(), runtime.config.webDistPath);
  if (!webDistPath || !existsSync(webDistPath)) {
    runtime.logger.warn('ashfox web ui dist missing; static hosting skipped', {
      webDistPath: webDistPath ?? 'unresolved'
    });
    return;
  }

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    index: false,
    wildcard: false
  });

  fastify.get('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestUrl = String(request.raw.url ?? '/');
    const pathname = requestUrl.split('?')[0] ?? '/';
    if (
      pathname.startsWith('/api/') ||
      pathname === '/mcp' ||
      pathname.startsWith('/mcp/') ||
      pathname === '/metrics' ||
      pathname.startsWith('/metrics/')
    ) {
      return reply.callNotFound();
    }
    if (pathname.includes('.')) {
      return reply.callNotFound();
    }
    return reply.sendFile('index.html');
  });

  runtime.logger.info('ashfox web ui hosting enabled', { webDistPath });
};

const toPathname = (url: string): string => url.split('?')[0] ?? '/';

const isPublicApiPath = (pathname: string): boolean =>
  pathname === '/api/health' || pathname === '/api/auth' || pathname.startsWith('/api/auth/');

const registerApiAuthHook = async (app: NestFastifyApplication, auth: AuthService): Promise<void> => {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = (request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      return;
    }
    const pathname = toPathname(request.raw.url ?? request.url ?? '/');
    if (!pathname.startsWith('/api/') || isPublicApiPath(pathname)) {
      return;
    }

    const user = await auth.authenticateFromHeaders(request.headers as Record<string, unknown>);
    if (!user) {
      if (!reply.sent) {
        reply
          .code(401)
          .headers(API_CORS_HEADERS)
          .send({
            ok: false,
            code: 'unauthorized',
            message: '로그인이 필요합니다.'
          });
      }
      return reply;
    }
    auth.applyActorHeaders(request.headers as Record<string, unknown>, user);
  });
};

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: MAX_BODY_BYTES }),
    { logger: false }
  );
  app.enableCors(GLOBAL_CORS_OPTIONS);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false
    })
  );
  const runtime = app.get(GatewayRuntimeService);
  const auth = app.get(AuthService);
  const serviceManagement = app.get(ServiceManagementService);
  await auth.ensureBootstrapAdmin();
  await serviceManagement.bootstrapRuntimeSettings();
  await registerApiAuthHook(app, auth);
  app.useGlobalFilters(new GatewayExceptionFilter(runtime.logger));
  await registerWebUiHosting(app, runtime);

  await app.listen({ host: runtime.config.host, port: runtime.config.port });
  runtime.logger.info('ashfox gateway started', {
    host: runtime.config.host,
    port: runtime.config.port,
    path: runtime.config.path,
    backend: runtime.config.backend,
    persistence: runtime.persistence.health,
    framework: 'nest-fastify'
  });

  let shuttingDown = false;
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    runtime.logger.info('ashfox gateway shutdown', { signal });
    let exitCode = 0;
    try {
      await runtime.shutdown(runtime.logger);
    } catch (_error) {
      exitCode = 1;
    }
    try {
      await app.close();
    } catch (error) {
      exitCode = 1;
      runtime.logger.error('ashfox gateway app close failed', toLoggableError(error));
    }
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

void bootstrap().catch((error) => {
  const logger = new ConsoleLogger('gateway', () => 'info');
  logger.error('ashfox gateway startup failed', {
    ...toLoggableError(error),
    message: errorMessage(error)
  });
  process.exit(1);
});
