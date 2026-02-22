import assert from 'node:assert/strict';
import { registerAsync } from './helpers';
import {
  isWorkspaceAdminTool,
  resolveWorkspaceToolRegistry
} from '../src/mcp/workspaceToolVisibility';

registerAsync(
  (async () => {
    const emptyRegistry = resolveWorkspaceToolRegistry({
      canReadProject: false,
      canWriteProject: false,
      canManageWorkspace: false
    });
    assert.equal(emptyRegistry.tools.length, 0);

    const readOnlyRegistry = resolveWorkspaceToolRegistry({
      canReadProject: true,
      canWriteProject: false,
      canManageWorkspace: false
    });
    assert.equal(readOnlyRegistry.tools.some((tool) => tool.name === 'list_capabilities'), true);
    assert.equal(readOnlyRegistry.tools.some((tool) => tool.name === 'ensure_project'), false);
    assert.equal(readOnlyRegistry.tools.some((tool) => tool.name === 'workspace_get_metrics'), false);

    const writeRegistry = resolveWorkspaceToolRegistry({
      canReadProject: true,
      canWriteProject: true,
      canManageWorkspace: false
    });
    assert.equal(writeRegistry.tools.some((tool) => tool.name === 'ensure_project'), true);
    assert.equal(writeRegistry.tools.some((tool) => tool.name === 'workspace_get_metrics'), false);

    const manageRegistry = resolveWorkspaceToolRegistry({
      canReadProject: true,
      canWriteProject: true,
      canManageWorkspace: true
    });
    assert.equal(manageRegistry.tools.some((tool) => tool.name === 'workspace_get_metrics'), true);
    assert.equal(isWorkspaceAdminTool('workspace_get_metrics'), true);
    assert.equal(isWorkspaceAdminTool('ensure_project'), false);

    const manageRegistryAgain = resolveWorkspaceToolRegistry({
      canReadProject: true,
      canWriteProject: true,
      canManageWorkspace: true
    });
    assert.equal(manageRegistryAgain.hash, manageRegistry.hash);
    assert.equal(manageRegistryAgain.count, manageRegistry.count);
  })()
);
