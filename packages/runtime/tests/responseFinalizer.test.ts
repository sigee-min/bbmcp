import assert from 'node:assert/strict';

import { finalizeToolResponse } from '../src/dispatcher/responseFinalizer';
import type { Logger } from '../src/logging';
import type { ToolPayloadMap, ToolResponse } from '../src/types';

const logger: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

{
  const refreshed: string[] = [];
  const service = {
    notifyViewportRefresh: (tool: string) => {
      refreshed.push(tool);
    }
  };
  const payload = {} as ToolPayloadMap['list_capabilities'];
  const response: ToolResponse<{ ok: true }> = { ok: true, data: { ok: true } };
  const out = finalizeToolResponse(
    { service: service as never, log: logger },
    'list_capabilities',
    payload,
    response,
    { refreshViewport: true }
  );
  assert.equal(out.ok, true);
  assert.deepEqual(refreshed, ['list_capabilities']);
}

{
  const refreshed: string[] = [];
  const service = {
    notifyViewportRefresh: (tool: string) => {
      refreshed.push(tool);
    }
  };
  const payload = {} as ToolPayloadMap['list_capabilities'];
  const response: ToolResponse<{ ok: true }> = { ok: false, error: { code: 'invalid_payload', message: 'x' } };
  finalizeToolResponse(
    { service: service as never, log: logger },
    'list_capabilities',
    payload,
    response,
    { refreshViewport: true }
  );
  assert.deepEqual(refreshed, []);
}
