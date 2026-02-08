import assert from 'node:assert/strict';

import { callWithAutoRetry } from '../../../src/dispatcher/retryPolicy';

const noopLog = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
} as const;

const run = async () => {
  {
    let calls = 0;
    const service = {
      isAutoRetryRevisionEnabled: () => true,
      isRevisionRequired: () => true,
      getProjectState: () =>
        ({
          ok: true,
          value: {
            project: {
              id: 'p1',
              active: true,
              name: 'demo',
              format: 'Generic Model',
              revision: 'r2',
              counts: { bones: 0, cubes: 0, textures: 0, animations: 0 }
            }
          }
        } as const)
    };

    const result = await callWithAutoRetry({
      tool: 'update_cube',
      payload: { ifRevision: 'r1', name: 'cube_1' },
      call: async (payload) => {
        calls += 1;
        if (payload.ifRevision === 'r2') {
          return { ok: true, data: { id: 'cube_1', name: 'cube_1' } };
        }
        return {
          ok: false,
          error: {
            code: 'invalid_state_revision_mismatch',
            message: 'revision mismatch',
            details: { expected: payload.ifRevision, current: 'r2' }
          }
        };
      },
      service: service as never,
      log: noopLog as never
    });

    assert.equal(calls, 2);
    assert.equal(result.payload.ifRevision, 'r2');
    assert.equal(result.result.ok, true);
  }

  {
    let calls = 0;
    const service = {
      isAutoRetryRevisionEnabled: () => true,
      isRevisionRequired: () => true,
      getProjectState: () =>
        ({
          ok: true,
          value: {
            project: {
              id: 'p1',
              active: true,
              name: 'demo',
              format: 'Generic Model',
              revision: 'r1',
              counts: { bones: 0, cubes: 0, textures: 0, animations: 0 }
            }
          }
        } as const)
    };

    const result = await callWithAutoRetry({
      tool: 'update_cube',
      payload: { ifRevision: 'r1', name: 'cube_1' },
      call: async () => {
        calls += 1;
        return {
          ok: false,
          error: {
            code: 'invalid_state_revision_mismatch',
            message: 'revision mismatch',
            details: { expected: 'r1', current: 'r1' }
          }
        };
      },
      service: service as never,
      log: noopLog as never
    });

    assert.equal(calls, 1);
    assert.equal(result.payload.ifRevision, 'r1');
    assert.equal(result.result.ok, false);
  }
};

const pending = run();
const queue = (globalThis as { __ashfox_test_promises?: Promise<unknown>[] }).__ashfox_test_promises;
if (Array.isArray(queue)) {
  queue.push(pending);
}
