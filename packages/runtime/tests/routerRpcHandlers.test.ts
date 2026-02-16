import assert from 'node:assert/strict';

import { handleMessage } from '../src/transport/mcp/routerRpcHandlers';
import type { RpcContext } from '../src/transport/mcp/routerRpcTypes';
import type { ToolExecutor } from '../src/transport/mcp/executor';
import { SessionStore } from '../src/transport/mcp/session';
import type { ToolRegistry } from '../src/transport/mcp/tools';
import { noopLog, registerAsync } from './helpers';
import {
  MCP_INITIALIZE_REQUIRES_ID,
  MCP_JSONRPC_INVALID_REQUEST,
  MCP_METHOD_NOT_FOUND,
  MCP_SERVER_NOT_INITIALIZED,
  MCP_SESSION_UNAVAILABLE
} from '../src/shared/messages';

const createContext = (options?: { supportedProtocols?: string[] }): RpcContext => {
  const executor: ToolExecutor = {
    callTool: async () => ({ ok: true, data: {} })
  };
  const toolRegistry: ToolRegistry = {
    tools: [{ name: 'demo_tool', title: 'Demo', inputSchema: {} }],
    map: new Map([['demo_tool', { name: 'demo_tool', title: 'Demo', inputSchema: {} }]]),
    hash: 'demo',
    count: 1
  };
  return {
    executor,
    log: noopLog,
    toolRegistry,
    sessions: new SessionStore(),
    supportedProtocols: options?.supportedProtocols,
    config: { path: '/mcp', serverInfo: { name: 'ashfox-test', version: '0.0.0' }, instructions: 'demo' }
  };
};

registerAsync(
  (async () => {
    {
      const outcome = await handleMessage(createContext(), { method: 'ping' } as never, null, 1);
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_JSONRPC_INVALID_REQUEST);
    }

    {
      const session = new SessionStore().create('s1', '2025-06-18');
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'initialize', params: {} },
        session,
        null
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_INITIALIZE_REQUIRES_ID);
    }

    {
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 },
        null,
        1
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_SESSION_UNAVAILABLE);
    }

    {
      const session = new SessionStore().create('s2', '2025-06-18');
      const ctx = createContext({ supportedProtocols: ['2025-11-25', '2025-06-18'] });
      const outcome = await handleMessage(
        ctx,
        { jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2025-11-25' }, id: 2 },
        session,
        2
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 200);
      assert.equal(session.initialized, true);
      assert.equal(session.protocolVersion, '2025-11-25');
      const result = outcome.response.result as Record<string, unknown>;
      assert.equal(result.protocolVersion, '2025-11-25');
    }

    {
      const session = new SessionStore().create('s3', '2025-06-18');
      session.initialized = true;
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'tools/list', id: 3 },
        session,
        3
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 200);
      const result = outcome.response.result as Record<string, unknown>;
      assert.ok(Array.isArray(result.tools));
    }

    {
      const session = new SessionStore().create('s4', '2025-06-18');
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'ping', id: 4 },
        session,
        4
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_SERVER_NOT_INITIALIZED);
    }

    {
      const session = new SessionStore().create('s5', '2025-06-18');
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        session,
        null
      );
      assert.equal(outcome.type, 'notification');
      assert.equal(session.initialized, true);
    }

    {
      const session = new SessionStore().create('s6', '2025-06-18');
      session.initialized = true;
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'missing/method', id: 6 },
        session,
        6
      );
      assert.equal(outcome.type, 'response');
      if (outcome.type !== 'response') return;
      assert.equal(outcome.status, 400);
      assert.equal(outcome.response.error?.message, MCP_METHOD_NOT_FOUND('missing/method'));
    }

    {
      const session = new SessionStore().create('s7', '2025-06-18');
      session.initialized = true;
      const outcome = await handleMessage(
        createContext(),
        { jsonrpc: '2.0', method: 'ping' },
        session,
        null
      );
      assert.equal(outcome.type, 'notification');
    }
  })()
);

