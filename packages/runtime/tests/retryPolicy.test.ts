import assert from 'node:assert/strict';

import { callWithAutoRetry } from '../src/dispatcher/retryPolicy';
import type { ToolError } from '/contracts/types/internal';
import { registerAsync } from './helpers';

type TestLogger = {
  debugLogs: Array<{ message: string; meta?: Record<string, unknown> }>;
  infoLogs: Array<{ message: string; meta?: Record<string, unknown> }>;
  warnLogs: Array<{ message: string; meta?: Record<string, unknown> }>;
  logger: {
    log: () => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: () => void;
  };
};

const createLogger = (): TestLogger => {
  const debugLogs: TestLogger['debugLogs'] = [];
  const infoLogs: TestLogger['infoLogs'] = [];
  const warnLogs: TestLogger['warnLogs'] = [];
  return {
    debugLogs,
    infoLogs,
    warnLogs,
    logger: {
      log: () => undefined,
      debug: (message, meta) => debugLogs.push({ message, meta }),
      info: (message, meta) => infoLogs.push({ message, meta }),
      warn: (message, meta) => warnLogs.push({ message, meta }),
      error: () => undefined
    }
  };
};

const revisionMismatch = (expected: string, currentRevision: string): ToolError => ({
  code: 'invalid_state_revision_mismatch',
  message: 'revision mismatch',
  details: { expected, currentRevision, reason: 'revision_mismatch' }
});

const invalidState = (reason: string): ToolError => ({
  code: 'invalid_state',
  message: reason,
  details: { reason }
});

const createService = (options: {
  autoRetry: boolean;
  requiresRevision: boolean;
  stateResult:
    | { ok: true; value: { project: { revision?: string; active: boolean } } }
    | { ok: false; error: ToolError };
}) =>
  ({
    isAutoRetryRevisionEnabled: () => options.autoRetry,
    isRevisionRequired: () => options.requiresRevision,
    getProjectState: () => options.stateResult
  }) as {
    isAutoRetryRevisionEnabled: () => boolean;
    isRevisionRequired: () => boolean;
    getProjectState: () => unknown;
  };

registerAsync(
  (async () => {
    // first call success -> no retry
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          return { ok: true, value: { ok: true } };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, true);
      assert.equal(log.infoLogs.length, 0);
    }

    // auto retry disabled -> return first mismatch
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: false,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          return { ok: false, error: revisionMismatch('r1', 'r2') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, false);
      assert.equal(log.debugLogs.length, 0);
    }

    // non-mismatch error -> return first
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          return { ok: false, error: invalidState('invalid_payload') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, false);
      assert.equal(log.debugLogs.length, 0);
    }

    // guard failure (missing ifRevision) -> retry skipped with debug
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: {},
        call: () => {
          calls += 1;
          return { ok: false, error: revisionMismatch('r1', 'r2') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, false);
      assert.equal(log.debugLogs.length, 1);
      assert.equal(log.debugLogs[0].meta?.reason, 'missing_ifRevision');
    }

    // guard state unavailable -> retry skipped with reason
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: false, error: invalidState('state_unavailable') }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          return { ok: false, error: revisionMismatch('r1', 'r2') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, false);
      assert.equal(log.debugLogs.length, 1);
      assert.equal(log.debugLogs[0].meta?.reason, 'state_unavailable');
    }

    // no new revision -> retry skipped
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r1', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          return { ok: false, error: revisionMismatch('r1', 'r2') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 1);
      assert.equal(result.result.ok, false);
      assert.equal(log.debugLogs.length, 1);
      assert.equal(log.debugLogs[0].meta?.reason, 'no_new_revision');
    }

    // retry success path
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1', name: 'cube' },
        call: (payload: { ifRevision?: string; name: string }) => {
          calls += 1;
          if (calls === 1) return { ok: false, error: revisionMismatch('r1', 'r2') };
          return { ok: true, value: { applied: payload.ifRevision } };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 2);
      assert.equal(result.payload.ifRevision, 'r2');
      assert.equal(result.result.ok, true);
      assert.equal(log.infoLogs.length >= 2, true);
    }

    // retry failure path
    {
      let calls = 0;
      const log = createLogger();
      const service = createService({
        autoRetry: true,
        requiresRevision: true,
        stateResult: { ok: true, value: { project: { revision: 'r2', active: true } } }
      });
      const result = await callWithAutoRetry({
        tool: 'update_cube',
        payload: { ifRevision: 'r1' },
        call: () => {
          calls += 1;
          if (calls === 1) return { ok: false, error: revisionMismatch('r1', 'r2') };
          return { ok: false, error: invalidState('retry_failed') };
        },
        service: service as never,
        log: log.logger as never
      });
      assert.equal(calls, 2);
      assert.equal(result.result.ok, false);
      assert.equal(log.warnLogs.length, 1);
      assert.equal(log.warnLogs[0].meta?.code, 'invalid_state');
    }
  })()
);
