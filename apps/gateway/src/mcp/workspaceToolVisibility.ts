import { isMutatingTool } from '@ashfox/backend-core';
import { computeToolRegistryHash } from '@ashfox/contracts/mcpSchemas/policy';
import type { McpToolDefinition } from '@ashfox/runtime/transport/mcp/types';
import {
  DEFAULT_TOOL_REGISTRY,
  type ToolRegistry
} from '@ashfox/runtime/transport/mcp/tools';
import { WORKSPACE_ADMIN_MCP_TOOLS, WORKSPACE_ADMIN_TOOL_NAMES } from './workspaceAdminToolRegistry';

export interface WorkspaceToolPermissionSnapshot {
  canReadProject: boolean;
  canWriteProject: boolean;
  canManageWorkspace: boolean;
}

const EMPTY_TOOL_REGISTRY: ToolRegistry = {
  tools: [],
  map: new Map(),
  hash: computeToolRegistryHash([]),
  count: 0
};

const READ_ONLY_WORKSPACE_TOOLS: McpToolDefinition[] = DEFAULT_TOOL_REGISTRY.tools.filter(
  (tool) => !isMutatingTool(tool.name as never)
);

const buildRegistry = (tools: readonly McpToolDefinition[]): ToolRegistry => {
  const deduped = new Map<string, McpToolDefinition>();
  for (const tool of tools) {
    deduped.set(tool.name, tool);
  }
  const ordered = Array.from(deduped.values());
  return {
    tools: ordered,
    map: new Map(ordered.map((tool) => [tool.name, tool])),
    hash: computeToolRegistryHash(ordered),
    count: ordered.length
  };
};

const registryCache = new Map<string, ToolRegistry>();

const toSnapshotKey = (snapshot: WorkspaceToolPermissionSnapshot): string =>
  `r${snapshot.canReadProject ? 1 : 0}-w${snapshot.canWriteProject ? 1 : 0}-m${snapshot.canManageWorkspace ? 1 : 0}`;

const resolveWorkspaceModelingTools = (
  snapshot: WorkspaceToolPermissionSnapshot
): readonly McpToolDefinition[] => {
  if (snapshot.canWriteProject) {
    return DEFAULT_TOOL_REGISTRY.tools;
  }
  if (snapshot.canReadProject) {
    return READ_ONLY_WORKSPACE_TOOLS;
  }
  return EMPTY_TOOL_REGISTRY.tools;
};

export const resolveWorkspaceToolRegistry = (
  snapshot: WorkspaceToolPermissionSnapshot
): ToolRegistry => {
  const key = toSnapshotKey(snapshot);
  const cached = registryCache.get(key);
  if (cached) {
    return cached;
  }

  const baseTools = resolveWorkspaceModelingTools(snapshot);
  const tools = snapshot.canManageWorkspace
    ? [...baseTools, ...WORKSPACE_ADMIN_MCP_TOOLS]
    : [...baseTools];
  const registry = buildRegistry(tools);
  registryCache.set(key, registry);
  return registry;
};

export const isWorkspaceAdminTool = (toolName: string): boolean =>
  WORKSPACE_ADMIN_TOOL_NAMES.has(toolName);
