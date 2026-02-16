import assert from 'node:assert/strict';

import { handleToolCall } from '../src/transport/mcp/routerRpcToolCall';
import type { RpcContext } from '../src/transport/mcp/routerRpcTypes';
import type { ToolExecutor } from '../src/transport/mcp/executor';
import type { ToolRegistry } from '../src/transport/mcp/tools';
import { SessionStore } from '../src/transport/mcp/session';
import { noopLog, registerAsync } from './helpers';
import { MCP_TOOL_NAME_REQUIRED, MCP_UNKNOWN_TOOL } from '../src/shared/messages';

const createContext = (options?: {
  executor?: ToolExecutor;
  tools?: ToolRegistry;
}): RpcContext => {
  const toolRegistry: ToolRegistry =
    options?.tools ??
    ({
      tools: [{ name: 'demo_tool', title: 'Demo', description: 'demo' }],
      map: new Map([['demo_tool', { name: 'demo_tool', title: 'Demo', description: 'demo' }]]),
      hash: 'demo',
      count: 1
    } as ToolRegistry);
  return {
    executor: options?.executor ?? {
      callTool: async () => ({ ok: true, data: { ok: true } })
    },
    log: noopLog,
    toolRegistry,
    sessions: new SessionStore(),
    config: { path: '/mcp' }
  };
};

registerAsync(
  (async () => {
    const session = new SessionStore().create('s1', '2025-06-18');
    session.initialized = true;

    {
      const outcome = await handleToolCall(
        createContext(),
        { jsonrpc: '2.0', method: 'tools/call', params: {} },
        session,
        1
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_TOOL_NAME_REQUIRED);
    }

    {
      const outcome = await handleToolCall(
        createContext(),
        { jsonrpc: '2.0', method: 'tools/call', params: { name: 'missing', arguments: {} } },
        session,
        2
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_UNKNOWN_TOOL('missing'));
    }

    {
      const outcome = await handleToolCall(
        createContext({
          executor: {
            callTool: async () => ({ ok: true, data: { value: 42 } })
          }
        }),
        { jsonrpc: '2.0', method: 'tools/call', params: { name: 'demo_tool', arguments: {} } },
        session,
        3
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 200);
      const result = outcome.response.result as Record<string, unknown>;
      assert.deepEqual(result.structuredContent, { value: 42 });
      assert.ok(Array.isArray(result.content));
    }

    {
      const outcome = await handleToolCall(
        createContext({
          executor: {
            callTool: async () => {
              throw new Error('executor failed');
            }
          }
        }),
        { jsonrpc: '2.0', method: 'tools/call', params: { name: 'demo_tool', arguments: {} } },
        session,
        4
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 200);
      const result = outcome.response.result as Record<string, unknown>;
      assert.equal(result.isError, true);
      assert.ok(Array.isArray(result.content));
    }
  })()
);
