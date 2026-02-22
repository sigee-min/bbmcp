import type { DispatcherExecutionContext, ToolResponse } from '@ashfox/contracts/types/internal';
import type { ToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import { isWorkspaceAdminTool } from './workspaceToolVisibility';

export class CompositeMcpToolExecutor implements ToolExecutor {
  constructor(
    private readonly workspaceExecutor: ToolExecutor,
    private readonly workspaceAdminExecutor: ToolExecutor,
    private readonly serviceExecutor: ToolExecutor
  ) {}

  async callTool(
    name: string,
    args: unknown,
    context?: DispatcherExecutionContext
  ): Promise<ToolResponse<unknown>> {
    if (context?.mcpApiKeySpace === 'service') {
      return this.serviceExecutor.callTool(name, args, context);
    }
    if (isWorkspaceAdminTool(name)) {
      return this.workspaceAdminExecutor.callTool(name, args, context);
    }
    return this.workspaceExecutor.callTool(name, args, context);
  }
}
