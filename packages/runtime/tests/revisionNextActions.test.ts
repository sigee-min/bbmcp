import assert from 'node:assert/strict';

import { appendMissingRevisionNextActions } from '../src/shared/tooling/revisionNextActions';
import type { ToolResponse } from '/contracts/types/internal';

{
  const response: ToolResponse<unknown> = {
    ok: false,
    error: {
      code: 'invalid_state',
      message: 'ifRevision is required',
      details: { reason: 'missing_ifRevision' }
    }
  };

  const result = appendMissingRevisionNextActions('add_cube', { name: 'cube', from: [0, 0, 0], to: [1, 1, 1] }, response);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(Array.isArray(result.nextActions));
    assert.equal(result.nextActions?.length, 2);
    assert.equal(result.nextActions?.[0]?.type, 'call_tool');
    assert.equal((result.nextActions?.[0] as { tool?: string }).tool, 'get_project_state');
    assert.equal((result.nextActions?.[1] as { tool?: string }).tool, 'add_cube');
  }
}

{
  const response: ToolResponse<unknown> = {
    ok: false,
    error: {
      code: 'invalid_state',
      message: 'ifRevision is required',
      details: { reason: 'missing_ifRevision' }
    },
    nextActions: [
      { type: 'call_tool', tool: 'get_project_state', arguments: { detail: 'summary' }, reason: 'Existing', priority: 1 }
    ]
  };

  const result = appendMissingRevisionNextActions('add_cube', { name: 'cube', from: [0, 0, 0], to: [1, 1, 1] }, response);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const calls = result.nextActions?.filter((action) => action.type === 'call_tool') ?? [];
    assert.equal(calls.length, 2);
    const tools = calls.map((action) => (action as { tool?: string }).tool);
    assert.deepEqual(tools.sort(), ['add_cube', 'get_project_state']);
  }
}
