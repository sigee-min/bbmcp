import { computeToolRegistryHash } from '@ashfox/contracts/mcpSchemas/policy';
import type { McpToolDefinition } from '@ashfox/runtime/transport/mcp/types';
import type { ToolRegistry } from '@ashfox/runtime/transport/mcp/tools';
import { workspaceAdminToolSchemas } from './workspaceAdminToolSchemas';

const defineTool = (tool: McpToolDefinition): McpToolDefinition => tool;

export const WORKSPACE_ADMIN_MCP_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'workspace_get_metrics',
    title: 'Workspace Get Metrics',
    description: 'Read workspace-level management metrics snapshot.',
    inputSchema: workspaceAdminToolSchemas.workspace_get_metrics
  }),
  defineTool({
    name: 'workspace_list_members',
    title: 'Workspace List Members',
    description: 'List workspace members.',
    inputSchema: workspaceAdminToolSchemas.workspace_list_members
  }),
  defineTool({
    name: 'workspace_upsert_member',
    title: 'Workspace Upsert Member',
    description: 'Create or update a workspace member role assignment.',
    inputSchema: workspaceAdminToolSchemas.workspace_upsert_member
  }),
  defineTool({
    name: 'workspace_delete_member',
    title: 'Workspace Delete Member',
    description: 'Remove a workspace member.',
    inputSchema: workspaceAdminToolSchemas.workspace_delete_member
  }),
  defineTool({
    name: 'workspace_list_roles',
    title: 'Workspace List Roles',
    description: 'List workspace roles.',
    inputSchema: workspaceAdminToolSchemas.workspace_list_roles
  }),
  defineTool({
    name: 'workspace_upsert_role',
    title: 'Workspace Upsert Role',
    description: 'Create or update a workspace role.',
    inputSchema: workspaceAdminToolSchemas.workspace_upsert_role
  }),
  defineTool({
    name: 'workspace_delete_role',
    title: 'Workspace Delete Role',
    description: 'Delete a workspace role.',
    inputSchema: workspaceAdminToolSchemas.workspace_delete_role
  }),
  defineTool({
    name: 'workspace_set_default_member_role',
    title: 'Workspace Set Default Member Role',
    description: 'Set the default role assigned to new workspace members.',
    inputSchema: workspaceAdminToolSchemas.workspace_set_default_member_role
  }),
  defineTool({
    name: 'workspace_list_acl_rules',
    title: 'Workspace List ACL Rules',
    description: 'List workspace folder ACL rules.',
    inputSchema: workspaceAdminToolSchemas.workspace_list_acl_rules
  }),
  defineTool({
    name: 'workspace_upsert_acl_rule',
    title: 'Workspace Upsert ACL Rule',
    description: 'Create or update a workspace folder ACL rule.',
    inputSchema: workspaceAdminToolSchemas.workspace_upsert_acl_rule
  }),
  defineTool({
    name: 'workspace_delete_acl_rule',
    title: 'Workspace Delete ACL Rule',
    description: 'Delete a workspace folder ACL rule.',
    inputSchema: workspaceAdminToolSchemas.workspace_delete_acl_rule
  })
];

export const WORKSPACE_ADMIN_TOOL_NAMES = new Set<string>(
  WORKSPACE_ADMIN_MCP_TOOLS.map((tool) => tool.name)
);

export const WORKSPACE_ADMIN_TOOL_REGISTRY: ToolRegistry = {
  tools: WORKSPACE_ADMIN_MCP_TOOLS,
  map: new Map(WORKSPACE_ADMIN_MCP_TOOLS.map((tool) => [tool.name, tool])),
  hash: computeToolRegistryHash(WORKSPACE_ADMIN_MCP_TOOLS),
  count: WORKSPACE_ADMIN_MCP_TOOLS.length
};
