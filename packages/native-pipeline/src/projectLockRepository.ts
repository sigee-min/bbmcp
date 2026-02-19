import { randomUUID } from 'node:crypto';
import { cloneProject } from './clone';
import type { NativePipelineState } from './state';
import type {
  NativeAcquireProjectLockInput,
  NativeProjectLock,
  NativeProjectSnapshot,
  NativeReleaseProjectLockInput,
  NativeRenewProjectLockInput
} from './types';

const DEFAULT_LOCK_TTL_MS = 30_000;
const MIN_LOCK_TTL_MS = 5_000;
const MAX_LOCK_TTL_MS = 300_000;

const nowIso = (): string => new Date().toISOString();

const clampLockTtlMs = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LOCK_TTL_MS;
  }
  const normalized = Math.trunc(value);
  if (normalized < MIN_LOCK_TTL_MS) {
    return MIN_LOCK_TTL_MS;
  }
  if (normalized > MAX_LOCK_TTL_MS) {
    return MAX_LOCK_TTL_MS;
  }
  return normalized;
};

const normalizeOwnerAgentId = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('ownerAgentId is required.');
  }
  return trimmed.slice(0, 128);
};

const normalizeOwnerSessionId = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 128) : null;
};

const parseExpiresAtMs = (lock: NativeProjectLock): number => {
  const parsed = Date.parse(lock.expiresAt);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const isLockExpired = (lock: NativeProjectLock, nowMs: number): boolean => {
  const expiresAt = parseExpiresAtMs(lock);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= nowMs;
};

const isSameOwner = (lock: NativeProjectLock, ownerAgentId: string, ownerSessionId: string | null): boolean =>
  lock.ownerAgentId === ownerAgentId && lock.ownerSessionId === ownerSessionId;

const cloneLock = (lock: NativeProjectLock): NativeProjectLock => ({
  ownerAgentId: lock.ownerAgentId,
  ownerSessionId: lock.ownerSessionId,
  token: lock.token,
  acquiredAt: lock.acquiredAt,
  heartbeatAt: lock.heartbeatAt,
  expiresAt: lock.expiresAt,
  mode: lock.mode
});

const hasVisibleLockDiff = (previous: NativeProjectLock | undefined, next: NativeProjectLock | null): boolean => {
  if (!previous && !next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }
  return (
    previous.ownerAgentId !== next.ownerAgentId ||
    previous.ownerSessionId !== next.ownerSessionId ||
    previous.mode !== next.mode ||
    previous.token !== next.token
  );
};

const syncProjectLockSnapshot = (
  state: NativePipelineState,
  projectId: string,
  nextLock: NativeProjectLock | null,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void
): void => {
  const project = state.projects.get(projectId);
  if (!project) {
    return;
  }
  const previous = project.projectLock;
  if (!hasVisibleLockDiff(previous, nextLock)) {
    return;
  }

  if (!nextLock) {
    delete project.projectLock;
  } else {
    project.projectLock = cloneLock(nextLock);
  }
  project.revision += 1;
  emitProjectSnapshot?.(cloneProject(project));
};

export class NativeProjectLockConflictError extends Error {
  readonly projectId: string;
  readonly ownerAgentId: string;
  readonly ownerSessionId: string | null;
  readonly expiresAt: string;

  constructor(projectId: string, lock: NativeProjectLock) {
    super(`Project lock conflict for ${projectId}. Locked by ${lock.ownerAgentId}.`);
    this.name = 'NativeProjectLockConflictError';
    this.projectId = projectId;
    this.ownerAgentId = lock.ownerAgentId;
    this.ownerSessionId = lock.ownerSessionId;
    this.expiresAt = lock.expiresAt;
  }
}

const buildActiveLock = (params: {
  ownerAgentId: string;
  ownerSessionId: string | null;
  ttlMs: number;
  acquiredAt?: string;
  token?: string;
}): NativeProjectLock => {
  const now = new Date();
  const nowIsoValue = now.toISOString();
  return {
    ownerAgentId: params.ownerAgentId,
    ownerSessionId: params.ownerSessionId,
    token: params.token ?? randomUUID(),
    acquiredAt: params.acquiredAt ?? nowIsoValue,
    heartbeatAt: nowIsoValue,
    expiresAt: new Date(now.getTime() + params.ttlMs).toISOString(),
    mode: 'mcp'
  };
};

export const releaseExpiredProjectLocks = (
  state: NativePipelineState,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void,
  nowMs: number = Date.now()
): number => {
  let released = 0;
  for (const [projectId, lock] of state.projectLocks.entries()) {
    if (!isLockExpired(lock, nowMs)) {
      continue;
    }
    state.projectLocks.delete(projectId);
    syncProjectLockSnapshot(state, projectId, null, emitProjectSnapshot);
    released += 1;
  }
  return released;
};

export const getProjectLock = (state: NativePipelineState, projectId: string): NativeProjectLock | null => {
  const lock = state.projectLocks.get(projectId);
  if (!lock) {
    return null;
  }
  if (isLockExpired(lock, Date.now())) {
    state.projectLocks.delete(projectId);
    return null;
  }
  return cloneLock(lock);
};

export const acquireProjectLock = (
  state: NativePipelineState,
  input: NativeAcquireProjectLockInput,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void
): NativeProjectLock => {
  releaseExpiredProjectLocks(state, emitProjectSnapshot);

  const ownerAgentId = normalizeOwnerAgentId(input.ownerAgentId);
  const ownerSessionId = normalizeOwnerSessionId(input.ownerSessionId);
  const ttlMs = clampLockTtlMs(input.ttlMs);

  const existing = state.projectLocks.get(input.projectId);
  if (existing && !isLockExpired(existing, Date.now())) {
    if (!isSameOwner(existing, ownerAgentId, ownerSessionId)) {
      throw new NativeProjectLockConflictError(input.projectId, existing);
    }

    const renewed = buildActiveLock({
      ownerAgentId,
      ownerSessionId,
      ttlMs,
      acquiredAt: existing.acquiredAt,
      token: existing.token
    });
    state.projectLocks.set(input.projectId, renewed);
    syncProjectLockSnapshot(state, input.projectId, renewed, emitProjectSnapshot);
    return cloneLock(renewed);
  }

  const acquired = buildActiveLock({
    ownerAgentId,
    ownerSessionId,
    ttlMs
  });
  state.projectLocks.set(input.projectId, acquired);
  syncProjectLockSnapshot(state, input.projectId, acquired, emitProjectSnapshot);
  return cloneLock(acquired);
};

export const renewProjectLock = (
  state: NativePipelineState,
  input: NativeRenewProjectLockInput,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void
): NativeProjectLock | null => {
  releaseExpiredProjectLocks(state, emitProjectSnapshot);

  const ownerAgentId = normalizeOwnerAgentId(input.ownerAgentId);
  const ownerSessionId = normalizeOwnerSessionId(input.ownerSessionId);
  const ttlMs = clampLockTtlMs(input.ttlMs);

  const existing = state.projectLocks.get(input.projectId);
  if (!existing) {
    return null;
  }
  if (!isSameOwner(existing, ownerAgentId, ownerSessionId)) {
    return null;
  }

  const renewed = buildActiveLock({
    ownerAgentId,
    ownerSessionId,
    ttlMs,
    acquiredAt: existing.acquiredAt,
    token: existing.token
  });
  state.projectLocks.set(input.projectId, renewed);
  syncProjectLockSnapshot(state, input.projectId, renewed, emitProjectSnapshot);
  return cloneLock(renewed);
};

export const releaseProjectLock = (
  state: NativePipelineState,
  input: NativeReleaseProjectLockInput,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void
): boolean => {
  releaseExpiredProjectLocks(state, emitProjectSnapshot);

  const ownerAgentId = normalizeOwnerAgentId(input.ownerAgentId);
  const ownerSessionId = normalizeOwnerSessionId(input.ownerSessionId);

  const existing = state.projectLocks.get(input.projectId);
  if (!existing) {
    return false;
  }
  if (!isSameOwner(existing, ownerAgentId, ownerSessionId)) {
    return false;
  }

  state.projectLocks.delete(input.projectId);
  syncProjectLockSnapshot(state, input.projectId, null, emitProjectSnapshot);
  return true;
};

export const releaseProjectLocksByOwner = (
  state: NativePipelineState,
  ownerAgentId: string,
  ownerSessionId?: string | null,
  emitProjectSnapshot?: (project: NativeProjectSnapshot) => void
): number => {
  releaseExpiredProjectLocks(state, emitProjectSnapshot);

  const normalizedAgentId = normalizeOwnerAgentId(ownerAgentId);
  const normalizedSessionId = normalizeOwnerSessionId(ownerSessionId);

  let released = 0;
  for (const [projectId, lock] of state.projectLocks.entries()) {
    if (lock.ownerAgentId !== normalizedAgentId) {
      continue;
    }
    if (ownerSessionId !== undefined && lock.ownerSessionId !== normalizedSessionId) {
      continue;
    }
    state.projectLocks.delete(projectId);
    syncProjectLockSnapshot(state, projectId, null, emitProjectSnapshot);
    released += 1;
  }
  return released;
};

export const lockMaintenanceNowIso = (): string => nowIso();
