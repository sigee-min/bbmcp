import { computeToolRegistryHash } from '@ashfox/contracts/mcpSchemas/policy';
import type { McpToolDefinition } from '@ashfox/runtime/transport/mcp/types';
import type { ToolRegistry } from '@ashfox/runtime/transport/mcp/tools';
import { serviceToolSchemas } from './serviceToolSchemas';

const defineTool = (tool: McpToolDefinition): McpToolDefinition => tool;

export const SERVICE_MCP_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'service_list_workspaces',
    title: 'Service List Workspaces',
    description: 'List workspaces in service management scope with optional query filters.',
    inputSchema: serviceToolSchemas.service_list_workspaces
  }),
  defineTool({
    name: 'service_list_users',
    title: 'Service List Users',
    description: 'List accounts in service management scope with optional query filters.',
    inputSchema: serviceToolSchemas.service_list_users
  }),
  defineTool({
    name: 'service_list_user_workspaces',
    title: 'Service List User Workspaces',
    description: 'List workspaces that a target account belongs to.',
    inputSchema: serviceToolSchemas.service_list_user_workspaces
  }),
  defineTool({
    name: 'service_set_user_roles',
    title: 'Service Set User Roles',
    description: 'Update system roles for a target account.',
    inputSchema: serviceToolSchemas.service_set_user_roles
  }),
  defineTool({
    name: 'service_get_config',
    title: 'Service Get Config',
    description: 'Read SMTP and GitHub authentication service settings.',
    inputSchema: serviceToolSchemas.service_get_config
  }),
  defineTool({
    name: 'service_update_smtp',
    title: 'Service Update SMTP',
    description: 'Update SMTP service settings.',
    inputSchema: serviceToolSchemas.service_update_smtp
  }),
  defineTool({
    name: 'service_update_github_auth',
    title: 'Service Update GitHub Auth',
    description: 'Update GitHub OAuth service settings.',
    inputSchema: serviceToolSchemas.service_update_github_auth
  })
];

export const SERVICE_TOOL_REGISTRY: ToolRegistry = {
  tools: SERVICE_MCP_TOOLS,
  map: new Map<string, McpToolDefinition>(SERVICE_MCP_TOOLS.map((tool) => [tool.name, tool])),
  hash: computeToolRegistryHash(SERVICE_MCP_TOOLS),
  count: SERVICE_MCP_TOOLS.length
};
