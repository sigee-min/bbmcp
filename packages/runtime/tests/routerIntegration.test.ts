import assert from 'node:assert/strict';

import { McpRouter } from '../src/transport/mcp/router';
import type { ToolExecutor } from '../src/transport/mcp/executor';
import type { HttpRequest } from '../src/transport/mcp/types';
import { noopLog, registerAsync } from './helpers';

const executor: ToolExecutor = {
  callTool: async () => ({ ok: true, data: { ok: true } })
};

const makePost = (body: unknown, headers?: Record<string, string>): HttpRequest => ({
  method: 'POST',
  url: 'http://localhost/mcp',
  headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

const parseJsonBody = (body: string): Record<string, unknown> => JSON.parse(body) as Record<string, unknown>;

registerAsync(
  (async () => {
    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'POST',
        url: 'http://localhost/other',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 404);
    }

    {
      const router = new McpRouter({ path: '/mcp', token: 'secret' }, executor, noopLog);
      const res = await router.handle(makePost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 401);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'PUT',
        url: 'http://localhost/mcp',
        headers: {},
        body: ''
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 405);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'GET',
        url: 'http://localhost/mcp',
        headers: {},
        body: ''
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 406);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'DELETE',
        url: 'http://localhost/mcp',
        headers: {},
        body: ''
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 400);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle(
        makePost({ jsonrpc: '2.0', id: 99, method: 'custom/method' })
      );
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 400);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'POST',
        url: 'http://localhost/mcp',
        headers: { 'content-type': 'text/plain' },
        body: '{}'
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 415);
    }

    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const res = await router.handle({
        method: 'POST',
        url: 'http://localhost/mcp',
        headers: { 'content-type': 'application/json' },
        body: '{bad-json'
      });
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 400);
    }

    {
      const router = new McpRouter({ path: '/mcp', supportedProtocols: ['2025-06-18'] }, executor, noopLog);
      const res = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          { 'mcp-protocol-version': '2024-11-05' }
        )
      );
      assert.equal(res.kind, 'json');
      assert.equal(res.status, 400);
    }

    let sessionId = '';
    {
      const router = new McpRouter({ path: '/mcp' }, executor, noopLog);
      const toolsList = await router.handle(makePost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      assert.equal(toolsList.kind, 'json');
      assert.equal(toolsList.status, 200);
      if (toolsList.kind !== 'json') return;
      sessionId = toolsList.headers['Mcp-Session-Id'];
      assert.ok(typeof sessionId === 'string' && sessionId.length > 0);

      const sseRes = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
          {
            accept: 'text/event-stream',
            'mcp-session-id': sessionId
          }
        )
      );
      assert.equal(sseRes.kind, 'sse');
      assert.equal(sseRes.status, 200);
      if (sseRes.kind === 'sse') {
        assert.equal(sseRes.close, true);
        assert.ok(Array.isArray(sseRes.events));
        assert.equal(sseRes.events.length, 1);
      }

      const notificationRes = await router.handle(
        makePost({ jsonrpc: '2.0', method: 'tools/list' }, { 'mcp-session-id': sessionId })
      );
      assert.equal(notificationRes.kind, 'empty');
      assert.equal(notificationRes.status, 202);

      const deleteRes = await router.handle({
        method: 'DELETE',
        url: 'http://localhost/mcp',
        headers: { 'mcp-session-id': sessionId },
        body: ''
      });
      assert.equal(deleteRes.kind, 'json');
      assert.equal(deleteRes.status, 200);
    }

    {
      const calledTools: string[] = [];
      const workspaceTool = { name: 'workspace_only', title: 'Workspace', inputSchema: {} };
      const serviceTool = { name: 'service_only', title: 'Service', inputSchema: {} };
      const workspaceRegistry = {
        tools: [workspaceTool],
        map: new Map([[workspaceTool.name, workspaceTool]]),
        hash: 'workspace',
        count: 1
      };
      const serviceRegistry = {
        tools: [serviceTool],
        map: new Map([[serviceTool.name, serviceTool]]),
        hash: 'service',
        count: 1
      };
      const router = new McpRouter(
        {
          path: '/mcp',
          authenticateRequest: async (request) => {
            const authorization = request.headers.authorization;
            if (authorization === 'Bearer service') {
              return {
                ok: true,
                principal: { keySpace: 'service', keyId: 'skey_alpha', accountId: 'admin' }
              };
            }
            return {
              ok: true,
              principal: { keySpace: 'workspace', keyId: 'wkey_alpha', accountId: 'admin', workspaceId: 'ws_alpha' }
            };
          },
          resolveToolRegistry: async ({ principal }) =>
            principal?.keySpace === 'service' ? serviceRegistry : workspaceRegistry
        },
        {
          callTool: async (name) => {
            calledTools.push(name);
            return { ok: true, data: { name } };
          }
        },
        noopLog,
        undefined,
        workspaceRegistry
      );

      const workspaceList = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 11, method: 'tools/list' },
          { authorization: 'Bearer workspace' }
        )
      );
      assert.equal(workspaceList.kind, 'json');
      assert.equal(workspaceList.status, 200);
      if (workspaceList.kind !== 'json') return;
      const workspaceListBody = parseJsonBody(workspaceList.body);
      const workspaceTools = (workspaceListBody.result as { tools?: Array<{ name?: string }> }).tools ?? [];
      assert.deepEqual(workspaceTools.map((entry) => entry.name), ['workspace_only']);

      const serviceList = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 12, method: 'tools/list' },
          { authorization: 'Bearer service' }
        )
      );
      assert.equal(serviceList.kind, 'json');
      assert.equal(serviceList.status, 200);
      if (serviceList.kind !== 'json') return;
      const serviceListBody = parseJsonBody(serviceList.body);
      const serviceTools = (serviceListBody.result as { tools?: Array<{ name?: string }> }).tools ?? [];
      assert.deepEqual(serviceTools.map((entry) => entry.name), ['service_only']);
      const serviceSessionId = serviceList.headers['Mcp-Session-Id'];
      assert.ok(typeof serviceSessionId === 'string' && serviceSessionId.length > 0);

      const hiddenToolCall = await router.handle(
        makePost(
          {
            jsonrpc: '2.0',
            id: 13,
            method: 'tools/call',
            params: { name: 'workspace_only', arguments: {} }
          },
          {
            authorization: 'Bearer service',
            'mcp-session-id': serviceSessionId
          }
        )
      );
      assert.equal(hiddenToolCall.kind, 'json');
      assert.equal(hiddenToolCall.status, 400);
      if (hiddenToolCall.kind !== 'json') return;
      const hiddenCallBody = parseJsonBody(hiddenToolCall.body);
      assert.match(String((hiddenCallBody.error as { message?: string })?.message ?? ''), /Unknown tool/);
      assert.deepEqual(calledTools, []);
    }

    {
      const router = new McpRouter(
        {
          path: '/mcp',
          authenticateRequest: async (request) => {
            const authorization = request.headers.authorization;
            if (authorization === 'Bearer service') {
              return {
                ok: true,
                principal: { keySpace: 'service', keyId: 'skey_alpha', accountId: 'admin' }
              };
            }
            return {
              ok: true,
              principal: { keySpace: 'workspace', keyId: 'wkey_alpha', accountId: 'admin', workspaceId: 'ws_alpha' }
            };
          }
        },
        executor,
        noopLog
      );

      const workspaceList = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 14, method: 'tools/list' },
          { authorization: 'Bearer workspace' }
        )
      );
      assert.equal(workspaceList.kind, 'json');
      assert.equal(workspaceList.status, 200);
      if (workspaceList.kind !== 'json') return;
      const sessionId = workspaceList.headers['Mcp-Session-Id'];
      assert.ok(typeof sessionId === 'string' && sessionId.length > 0);

      const crossPrincipalReuse = await router.handle(
        makePost(
          { jsonrpc: '2.0', id: 15, method: 'tools/list' },
          { authorization: 'Bearer service', 'mcp-session-id': sessionId }
        )
      );
      assert.equal(crossPrincipalReuse.kind, 'json');
      assert.equal(crossPrincipalReuse.status, 401);
      if (crossPrincipalReuse.kind !== 'json') return;
      const body = parseJsonBody(crossPrincipalReuse.body);
      assert.equal((body.error as { code?: string })?.code, 'unauthorized');
    }
  })()
);
