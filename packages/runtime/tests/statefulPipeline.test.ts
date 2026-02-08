import assert from 'node:assert/strict';

import { runStatefulPipeline } from '../src/dispatcher/statefulPipeline';
import type { ToolError, ToolResponse } from '../src/types';
import { registerAsync } from './helpers';

const revisionMismatchError = (expected: string, currentRevision: string): ToolError => ({
  code: 'invalid_state_revision_mismatch',
  message: 'revision mismatch',
  details: { expected, currentRevision, reason: 'revision_mismatch' }
});

const createLogger = () => ({
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
});

registerAsync(
  (async () => {
    // guardOptionalRevision short-circuits call execution and still runs attach/log hooks.
    {
      let callCount = 0;
      let attachCount = 0;
      let guardLogCount = 0;
      const result = await runStatefulPipeline(
        {
          service: {
            ensureRevisionMatchIfProvided: () => revisionMismatchError('r1', 'r2')
          } as never,
          log: createLogger() as never,
          attachStateForTool: (_payload, response) => {
            attachCount += 1;
            return response as ToolResponse<{ id: string; name: string }>;
          },
          logGuardFailure: (_tool, _payload, response) => {
            guardLogCount += 1;
            return response;
          }
        },
        {
          tool: 'update_cube',
          payload: { ifRevision: 'r1', name: 'body' } as never,
          call: () => {
            callCount += 1;
            return { ok: true, value: { id: 'cube_1', name: 'body' } };
          },
          retry: false
        }
      );

      assert.equal(callCount, 0);
      assert.equal(attachCount, 1);
      assert.equal(guardLogCount, 1);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'invalid_state_revision_mismatch');
      }
    }

    // retry=false executes call directly and routes through attach/log hooks.
    {
      let callCount = 0;
      let guardLogCount = 0;
      const result = await runStatefulPipeline(
        {
          service: {
            ensureRevisionMatchIfProvided: () => null
          } as never,
          log: createLogger() as never,
          attachStateForTool: (_payload, response) => {
            if (!response.ok) return response as ToolResponse<{ id: string; name: string; attached: boolean }>;
            return {
              ok: true,
              data: { ...response.data, attached: true }
            };
          },
          logGuardFailure: (_tool, _payload, response) => {
            guardLogCount += 1;
            return response;
          }
        },
        {
          tool: 'update_cube',
          payload: { name: 'body' } as never,
          call: () => {
            callCount += 1;
            return { ok: true, value: { id: 'cube_1', name: 'body' } };
          },
          retry: false
        }
      );

      assert.equal(callCount, 1);
      assert.equal(guardLogCount, 1);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.data, { id: 'cube_1', name: 'body', attached: true });
      }
    }

    // retry=true path uses auto-retry payload and passes updated ifRevision to attach/log.
    {
      let callCount = 0;
      let attachedIfRevision: string | undefined;
      const result = await runStatefulPipeline(
        {
          service: {
            isAutoRetryRevisionEnabled: () => true,
            isRevisionRequired: () => true,
            getProjectState: () => ({ ok: true, value: { project: { active: true, revision: 'r2' } } })
          } as never,
          log: createLogger() as never,
          attachStateForTool: (payload, response) => {
            attachedIfRevision = (payload as { ifRevision?: string }).ifRevision;
            return response as ToolResponse<{ revisionUsed?: string }>;
          },
          logGuardFailure: (_tool, _payload, response) => response
        },
        {
          tool: 'update_cube',
          payload: { ifRevision: 'r1', name: 'body' } as never,
          call: (payload) => {
            callCount += 1;
            if (callCount === 1) {
              return { ok: false, error: revisionMismatchError('r1', 'r2') };
            }
            return { ok: true, value: { revisionUsed: (payload as { ifRevision?: string }).ifRevision } };
          },
          retry: true
        }
      );

      assert.equal(callCount, 2);
      assert.equal(attachedIfRevision, 'r2');
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.revisionUsed, 'r2');
      }
    }
  })()
);
