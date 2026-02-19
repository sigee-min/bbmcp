import type { BackendKind } from '@ashfox/backend-core';
import type { LogLevel } from '@ashfox/runtime/logging';
import { DEFAULT_BACKEND, DEFAULT_PORT } from './constants';

export const toPort = (raw: string | undefined): number => {
  const numeric = Number(raw ?? DEFAULT_PORT);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 65535) {
    return DEFAULT_PORT;
  }
  return Math.floor(numeric);
};

export const resolveBackendKind = (raw: string | undefined): BackendKind => {
  if (raw === 'blockbench' || raw === 'engine') return raw;
  return DEFAULT_BACKEND;
};

export const resolveBooleanFlag = (raw: string | undefined, fallback: boolean): boolean => {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return true;
};

export const resolveLogLevel = (raw: string | undefined, fallback: LogLevel): LogLevel => {
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return fallback;
};

export const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
  const numeric = Number(raw ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
};
