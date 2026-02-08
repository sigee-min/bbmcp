import assert from 'node:assert/strict';

import { handleResourceTemplatesList, handleResourcesList, handleResourcesRead } from '../../../src/transport/mcp/routerRpcResources';
import type { RpcContext } from '../../../src/transport/mcp/routerRpcTypes';
import type { ToolExecutor } from '../../../src/transport/mcp/executor';
import type { ToolRegistry } from '../../../src/transport/mcp/tools';
import { SessionStore } from '../../../src/transport/mcp/session';
import { MCP_RESOURCE_NOT_FOUND, MCP_URI_REQUIRED } from '../../../src/shared/messages';

const noopLog = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
} as const;

const createContext = (resources?: RpcContext['resources']): RpcContext => {
  const executor: ToolExecutor = {
    callTool: async () => ({ ok: true, data: {} })
  };
  const toolRegistry: ToolRegistry = {
    tools: [],
    map: new Map(),
    hash: 'conformance',
    count: 0
  };
  return {
    executor,
    log: noopLog,
    resources,
    toolRegistry,
    sessions: new SessionStore(),
    config: { path: '/mcp' }
  };
};

{
  const listed = handleResourcesList(createContext(), 1);
  assert.equal(listed.type, 'response');
  if (listed.type === 'response') {
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.response.result, { resources: [], nextCursor: null });
  }
}

{
  const missingUri = handleResourcesRead(
    createContext(),
    { jsonrpc: '2.0', method: 'resources/read', params: {} },
    2
  );
  assert.equal(missingUri.type, 'response');
  if (missingUri.type === 'response') {
    assert.equal(missingUri.status, 400);
    assert.equal(missingUri.response.error?.message, MCP_URI_REQUIRED);
  }
}

{
  const notFound = handleResourcesRead(
    createContext({
      list: () => [],
      read: () => null,
      listTemplates: () => []
    }),
    { jsonrpc: '2.0', method: 'resources/read', params: { uri: 'ashfox://missing' } },
    3
  );
  assert.equal(notFound.type, 'response');
  if (notFound.type === 'response') {
    assert.equal(notFound.status, 404);
    assert.equal(notFound.response.error?.message, MCP_RESOURCE_NOT_FOUND);
  }
}

{
  const readOk = handleResourcesRead(
    createContext({
      list: () => [],
      read: (uri) => ({ uri, mimeType: 'application/json', text: '{"ok":true}' }),
      listTemplates: () => []
    }),
    { jsonrpc: '2.0', method: 'resources/read', params: { uri: 'ashfox://logs/trace-report.json' } },
    4
  );
  assert.equal(readOk.type, 'response');
  if (readOk.type === 'response') {
    assert.equal(readOk.status, 200);
    assert.deepEqual(readOk.response.result, {
      contents: [
        {
          uri: 'ashfox://logs/trace-report.json',
          mimeType: 'application/json',
          text: '{"ok":true}'
        }
      ]
    });
  }
}

{
  const templates = handleResourceTemplatesList(
    createContext({
      list: () => [],
      read: () => null,
      listTemplates: () => [{ uriTemplate: 'ashfox://textures/{name}', name: 'Texture by name' }]
    }),
    5
  );
  assert.equal(templates.type, 'response');
  if (templates.type === 'response') {
    assert.equal(templates.status, 200);
    assert.deepEqual(templates.response.result, {
      resourceTemplates: [{ uriTemplate: 'ashfox://textures/{name}', name: 'Texture by name' }],
      nextCursor: null
    });
  }
}
