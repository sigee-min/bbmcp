import type { FastifyRequest } from 'fastify';
import type { Logger } from '@ashfox/runtime/logging';

export const createNoopLogger = (): Logger => ({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const toRequest = (headers: Record<string, string>): FastifyRequest => ({ headers } as unknown as FastifyRequest);

export const parseJsonPlanBody = <T>(body: unknown): T => JSON.parse(typeof body === 'string' ? body : '{}') as T;
