import assert from 'node:assert/strict';

import { runResponsePipeline } from '../src/dispatcher/responsePipeline';
import { callTool } from '../src/transport/mcp/nextActions';
import type { ToolResponse } from '../src/types';

const createLogger = () => {
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  return {
    warnings,
    logger: {
      log: () => undefined,
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string, meta?: Record<string, unknown>) => {
        warnings.push({ message, meta });
      },
      error: () => undefined
    }
  };
};

// refreshViewport=true triggers viewport notification and trace recording for success.
{
  const notifications: string[] = [];
  const traces: ToolResponse<{ id: string; name: string }>[] = [];
  const { warnings, logger } = createLogger();
  const response = runResponsePipeline({
    tool: 'update_cube',
    payload: { name: 'body' } as never,
    response: { ok: true, data: { id: 'cube_1', name: 'body' } },
    refreshViewport: true,
    service: {
      notifyViewportRefresh: (tool: string) => {
        notifications.push(tool);
      }
    } as never,
    traceRecorder: {
      record: (_tool, _payload, toolResponse) => {
        traces.push(toolResponse as ToolResponse<{ id: string; name: string }>);
      }
    } as never,
    log: logger as never
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0], 'update_cube');
  assert.equal(traces.length, 1);
  assert.equal(warnings.length, 0);
  assert.equal(response.ok, true);
}

// viewport notify exception is swallowed and logged as warning.
{
  const { warnings, logger } = createLogger();
  const response = runResponsePipeline({
    tool: 'update_cube',
    payload: { name: 'body' } as never,
    response: { ok: true, data: { id: 'cube_1', name: 'body' } },
    refreshViewport: true,
    service: {
      notifyViewportRefresh: () => {
        throw new Error('refresh failed');
      }
    } as never,
    log: logger as never
  });

  assert.equal(response.ok, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, 'viewport refresh dispatch failed');
  assert.equal(warnings[0]?.meta?.tool, 'update_cube');
}

// missing_ifRevision appends deduped nextActions and trace sees post-processed response.
{
  const notifications: string[] = [];
  const traces: ToolResponse<{ id: string; name: string }>[] = [];
  const { warnings, logger } = createLogger();
  const response = runResponsePipeline({
    tool: 'update_cube',
    payload: { name: 'body' } as never,
    response: {
      ok: false,
      error: { code: 'invalid_state', message: 'missing revision', details: { reason: 'missing_ifRevision' } },
      nextActions: [callTool('get_project_state', { detail: 'summary' }, 'already added', 1)]
    },
    refreshViewport: true,
    service: {
      notifyViewportRefresh: (tool: string) => {
        notifications.push(tool);
      }
    } as never,
    traceRecorder: {
      record: (_tool, _payload, toolResponse) => {
        traces.push(toolResponse as ToolResponse<{ id: string; name: string }>);
      }
    } as never,
    log: logger as never
  });

  assert.equal(notifications.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(response.ok, false);
  if (!response.ok) {
    const tools = (response.nextActions ?? [])
      .filter((action) => action.type === 'call_tool')
      .map((action) => action.tool);
    assert.deepEqual(tools, ['get_project_state', 'update_cube']);
  }

  assert.equal(traces.length, 1);
  const tracedResponse = traces[0];
  assert.equal(tracedResponse?.ok, false);
  const tracedTools = (tracedResponse?.nextActions ?? [])
    .filter((action) => action.type === 'call_tool')
    .map((action) => action.tool);
  assert.deepEqual(tracedTools, ['get_project_state', 'update_cube']);
}
