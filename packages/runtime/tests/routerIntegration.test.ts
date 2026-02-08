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
  })()
);
