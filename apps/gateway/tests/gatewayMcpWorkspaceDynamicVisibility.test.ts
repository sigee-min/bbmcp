import assert from 'node:assert/strict';
import { computeToolRegistryHash } from '@ashfox/contracts/mcpSchemas/policy';
import { McpRouter } from '@ashfox/runtime/transport/mcp/router';
import type { ToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import type { HttpRequest, McpToolDefinition } from '@ashfox/runtime/transport/mcp/types';
import type { ToolRegistry } from '@ashfox/runtime/transport/mcp/tools';
import { registerAsync } from './helpers';
import { CompositeMcpToolExecutor } from '../src/mcp/compositeToolExecutor';

const makePost = (body: unknown, headers?: Record<string, string>): HttpRequest => ({
  method: 'POST',
  url: 'http://localhost/mcp',
  headers: {
    'content-type': 'application/json',
    ...(headers ?? {})
  },
  body: JSON.stringify(body)
});

const parseJsonBody = (body: string): Record<string, unknown> =>
  JSON.parse(body) as Record<string, unknown>;

const noopLog = {
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

const tool = (name: string): McpToolDefinition => ({
  name,
  title: name,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  }
});

const buildRegistry = (tools: McpToolDefinition[]): ToolRegistry => ({
  tools,
  map: new Map<string, McpToolDefinition>(tools.map((entry) => [entry.name, entry])),
  hash: computeToolRegistryHash(tools),
  count: tools.length
});

const WORKSPACE_READ_TOOL = tool('workspace_read_demo');
const WORKSPACE_WRITE_TOOL = tool('workspace_write_demo');
const WORKSPACE_ADMIN_TOOL = tool('workspace_get_metrics');
const SERVICE_TOOL = tool('service_get_config');

const WORKSPACE_READ_REGISTRY = buildRegistry([WORKSPACE_READ_TOOL]);
const WORKSPACE_WRITE_REGISTRY = buildRegistry([WORKSPACE_READ_TOOL, WORKSPACE_WRITE_TOOL]);
const WORKSPACE_ADMIN_REGISTRY = buildRegistry([
  WORKSPACE_READ_TOOL,
  WORKSPACE_WRITE_TOOL,
  WORKSPACE_ADMIN_TOOL
]);
const SERVICE_REGISTRY = buildRegistry([SERVICE_TOOL]);

registerAsync(
  (async () => {
    const workspaceCalls: string[] = [];
    const workspaceAdminCalls: string[] = [];
    const serviceCalls: string[] = [];

    const workspaceExecutor: ToolExecutor = {
      callTool: async (name) => {
        workspaceCalls.push(name);
        return { ok: true, data: { lane: 'workspace', name } };
      }
    };

    const workspaceAdminExecutor: ToolExecutor = {
      callTool: async (name) => {
        workspaceAdminCalls.push(name);
        return { ok: true, data: { lane: 'workspace-admin', name } };
      }
    };

    const serviceExecutor: ToolExecutor = {
      callTool: async (name) => {
        serviceCalls.push(name);
        return { ok: true, data: { lane: 'service', name } };
      }
    };

    const permissionByAccount = new Map<string, 'read' | 'write' | 'manage'>([
      ['workspace-admin', 'manage'],
      ['workspace-member', 'read']
    ]);

    const router = new McpRouter(
      {
        path: '/mcp',
        authenticateRequest: async (request) => {
          const authorization = request.headers.authorization;
          if (authorization === 'Bearer service-key') {
            return {
              ok: true,
              principal: {
                keySpace: 'service',
                keyId: 'skey_alpha',
                accountId: 'system-admin',
                systemRoles: ['system_admin']
              }
            };
          }

          if (authorization === 'Bearer workspace-member-key') {
            return {
              ok: true,
              principal: {
                keySpace: 'workspace',
                keyId: 'wkey_member',
                workspaceId: 'ws_alpha',
                accountId: 'workspace-member',
                systemRoles: []
              }
            };
          }

          return {
            ok: true,
            principal: {
              keySpace: 'workspace',
              keyId: 'wkey_admin',
              workspaceId: 'ws_alpha',
              accountId: 'workspace-admin',
              systemRoles: []
            }
          };
        },
        resolveToolRegistry: ({ principal }) => {
          if (principal?.keySpace === 'service') {
            return SERVICE_REGISTRY;
          }
          const permission = permissionByAccount.get(String(principal?.accountId ?? ''));
          if (permission === 'manage') {
            return WORKSPACE_ADMIN_REGISTRY;
          }
          if (permission === 'write') {
            return WORKSPACE_WRITE_REGISTRY;
          }
          if (permission === 'read') {
            return WORKSPACE_READ_REGISTRY;
          }
          return buildRegistry([]);
        }
      },
      new CompositeMcpToolExecutor(
        workspaceExecutor,
        workspaceAdminExecutor,
        serviceExecutor
      ),
      noopLog,
      undefined,
      WORKSPACE_ADMIN_REGISTRY
    );

    const adminList = await router.handle(
      makePost(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer workspace-admin-key' }
      )
    );
    assert.equal(adminList.kind, 'json');
    assert.equal(adminList.status, 200);
    if (adminList.kind !== 'json') {
      return;
    }
    const adminTools = (parseJsonBody(adminList.body).result as { tools?: Array<{ name?: string }> }).tools ?? [];
    assert.equal(adminTools.some((entry) => entry.name === 'workspace_get_metrics'), true);
    const adminSessionId = adminList.headers['Mcp-Session-Id'];
    assert.ok(typeof adminSessionId === 'string' && adminSessionId.length > 0);

    const adminToolCall = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'workspace_get_metrics', arguments: {} }
        },
        {
          authorization: 'Bearer workspace-admin-key',
          'mcp-session-id': adminSessionId
        }
      )
    );
    assert.equal(adminToolCall.kind, 'json');
    assert.equal(adminToolCall.status, 200);
    assert.deepEqual(workspaceAdminCalls, ['workspace_get_metrics']);

    const memberList = await router.handle(
      makePost(
        { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        { authorization: 'Bearer workspace-member-key' }
      )
    );
    assert.equal(memberList.kind, 'json');
    assert.equal(memberList.status, 200);
    if (memberList.kind !== 'json') {
      return;
    }
    const memberTools = (parseJsonBody(memberList.body).result as { tools?: Array<{ name?: string }> }).tools ?? [];
    assert.equal(memberTools.some((entry) => entry.name === 'workspace_read_demo'), true);
    assert.equal(memberTools.some((entry) => entry.name === 'workspace_write_demo'), false);
    assert.equal(memberTools.some((entry) => entry.name === 'workspace_get_metrics'), false);

    const serviceList = await router.handle(
      makePost(
        { jsonrpc: '2.0', id: 4, method: 'tools/list' },
        { authorization: 'Bearer service-key' }
      )
    );
    assert.equal(serviceList.kind, 'json');
    assert.equal(serviceList.status, 200);
    if (serviceList.kind !== 'json') {
      return;
    }
    const serviceTools = (parseJsonBody(serviceList.body).result as { tools?: Array<{ name?: string }> }).tools ?? [];
    assert.equal(serviceTools.some((entry) => entry.name === 'service_get_config'), true);
    assert.equal(serviceTools.some((entry) => entry.name === 'workspace_get_metrics'), false);

    permissionByAccount.set('workspace-admin', 'read');

    const hiddenAfterDemote = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'workspace_get_metrics', arguments: {} }
        },
        {
          authorization: 'Bearer workspace-admin-key',
          'mcp-session-id': adminSessionId
        }
      )
    );
    assert.equal(hiddenAfterDemote.kind, 'json');
    assert.equal(hiddenAfterDemote.status, 400);
    if (hiddenAfterDemote.kind !== 'json') {
      return;
    }
    const hiddenError = parseJsonBody(hiddenAfterDemote.body).error as { message?: string };
    assert.match(String(hiddenError?.message ?? ''), /Unknown tool/);
    assert.deepEqual(workspaceAdminCalls, ['workspace_get_metrics']);

    const allowedReadCall = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'workspace_read_demo', arguments: {} }
        },
        {
          authorization: 'Bearer workspace-admin-key',
          'mcp-session-id': adminSessionId
        }
      )
    );
    assert.equal(allowedReadCall.kind, 'json');
    assert.equal(allowedReadCall.status, 200);
    assert.deepEqual(workspaceCalls, ['workspace_read_demo']);
    assert.deepEqual(serviceCalls, []);
  })()
);
