import assert from 'node:assert/strict';
import { McpRouter } from '@ashfox/runtime/transport/mcp/router';
import type { HttpRequest } from '@ashfox/runtime/transport/mcp/types';
import type { ToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import type { ToolRegistry } from '@ashfox/runtime/transport/mcp/tools';
import { registerAsync } from './helpers';
import { CompositeMcpToolExecutor } from '../src/mcp/compositeToolExecutor';
import { SERVICE_TOOL_REGISTRY } from '../src/mcp/serviceToolRegistry';
import { ServiceToolExecutor } from '../src/mcp/serviceToolExecutor';
import type { ServiceManagementService } from '../src/services/service-management.service';

const makePost = (body: unknown, headers?: Record<string, string>): HttpRequest => ({
  method: 'POST',
  url: 'http://localhost/mcp',
  headers: {
    'content-type': 'application/json',
    ...(headers ?? {})
  },
  body: JSON.stringify(body)
});

const parseJsonBody = (body: string): Record<string, unknown> => JSON.parse(body) as Record<string, unknown>;
const noopLog = {
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

const workspaceTool = {
  name: 'workspace_demo',
  title: 'Workspace Demo',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  }
};

const WORKSPACE_TOOL_REGISTRY: ToolRegistry = {
  tools: [workspaceTool],
  map: new Map([[workspaceTool.name, workspaceTool]]),
  hash: 'workspace-demo',
  count: 1
};

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

    const serviceManagement = {
      listServiceWorkspacesByActor: async () => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, workspaces: [{ workspaceId: 'ws_alpha' }] })
      }),
      listServiceUsersByActor: async () => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, users: [{ accountId: 'admin' }] })
      }),
      listServiceUserWorkspacesByActor: async (_actor: unknown, accountId: string) => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, accountId })
      }),
      setServiceUserRolesByActor: async (_actor: unknown, accountId: string, body: { systemRoles: string[] }) => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, accountId, systemRoles: body.systemRoles })
      }),
      getServiceConfigByActor: async () => {
        serviceCalls.push('service_get_config');
        return {
          kind: 'json',
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, settings: { smtp: { enabled: false } } })
        };
      },
      upsertServiceSmtpSettingsByActor: async () => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, settings: { smtp: { enabled: true } } })
      }),
      upsertServiceGithubAuthSettingsByActor: async () => ({
        kind: 'json',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, settings: { githubAuth: { enabled: true } } })
      })
    } as unknown as ServiceManagementService;

    const serviceExecutor = new ServiceToolExecutor(() => serviceManagement);
    const executor = new CompositeMcpToolExecutor(
      workspaceExecutor,
      workspaceAdminExecutor,
      serviceExecutor
    );

    const router = new McpRouter(
      {
        path: '/mcp',
        authenticateRequest: async (request) => {
          const authorization = request.headers.authorization;
          if (authorization === 'Bearer skey') {
            return {
              ok: true,
              principal: {
                keySpace: 'service',
                keyId: 'skey_alpha',
                accountId: 'admin',
                systemRoles: ['system_admin']
              }
            };
          }
          return {
            ok: true,
            principal: {
              keySpace: 'workspace',
              keyId: 'wkey_alpha',
              workspaceId: 'ws_alpha',
              accountId: 'admin',
              systemRoles: ['system_admin']
            }
          };
        },
        resolveToolRegistry: ({ principal }) =>
          principal?.keySpace === 'service' ? SERVICE_TOOL_REGISTRY : WORKSPACE_TOOL_REGISTRY
      },
      executor,
      noopLog,
      undefined,
      WORKSPACE_TOOL_REGISTRY
    );

    const workspaceList = await router.handle(
      makePost(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        {
          authorization: 'Bearer wkey'
        }
      )
    );
    assert.equal(workspaceList.kind, 'json');
    assert.equal(workspaceList.status, 200);
    if (workspaceList.kind !== 'json') return;
    const workspaceTools = (parseJsonBody(workspaceList.body).result as { tools?: Array<{ name?: string }> }).tools ?? [];
    assert.deepEqual(workspaceTools.map((tool) => tool.name), ['workspace_demo']);

    const serviceList = await router.handle(
      makePost(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        {
          authorization: 'Bearer skey'
        }
      )
    );
    assert.equal(serviceList.kind, 'json');
    assert.equal(serviceList.status, 200);
    if (serviceList.kind !== 'json') return;
    const serviceTools = (parseJsonBody(serviceList.body).result as { tools?: Array<{ name?: string }> }).tools ?? [];
    assert.equal(serviceTools.some((tool) => tool.name === 'service_get_config'), true);
    assert.equal(serviceTools.some((tool) => tool.name === 'workspace_demo'), false);

    const serviceSessionId = serviceList.headers['Mcp-Session-Id'];
    assert.ok(typeof serviceSessionId === 'string' && serviceSessionId.length > 0);

    const hiddenCall = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'workspace_demo',
            arguments: {}
          }
        },
        {
          authorization: 'Bearer skey',
          'mcp-session-id': serviceSessionId
        }
      )
    );
    assert.equal(hiddenCall.kind, 'json');
    assert.equal(hiddenCall.status, 400);
    if (hiddenCall.kind !== 'json') return;
    assert.match(String((parseJsonBody(hiddenCall.body).error as { message?: string })?.message ?? ''), /Unknown tool/);

    const serviceCall = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'service_get_config',
            arguments: {}
          }
        },
        {
          authorization: 'Bearer skey',
          'mcp-session-id': serviceSessionId
        }
      )
    );
    assert.equal(serviceCall.kind, 'json');
    assert.equal(serviceCall.status, 200);
    assert.deepEqual(workspaceCalls, []);
    assert.deepEqual(serviceCalls, ['service_get_config']);

    const workspaceSessionId = workspaceList.headers['Mcp-Session-Id'];
    assert.ok(typeof workspaceSessionId === 'string' && workspaceSessionId.length > 0);
    const workspaceCall = await router.handle(
      makePost(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'workspace_demo',
            arguments: {}
          }
        },
        {
          authorization: 'Bearer wkey',
          'mcp-session-id': workspaceSessionId
        }
      )
    );
    assert.equal(workspaceCall.kind, 'json');
    assert.equal(workspaceCall.status, 200);
    assert.deepEqual(workspaceCalls, ['workspace_demo']);
    assert.deepEqual(workspaceAdminCalls, []);
  })()
);
