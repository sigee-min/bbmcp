import { Dispatcher, ToolName, ToolPayloadMap, ToolResponse } from '../../types';
import { normalizeToolResponse } from '../../shared/tooling/toolResponseGuard';
import { decorateToolResponse } from './responseDecorators';

export interface ToolExecutor {
  callTool: (name: string, args: unknown) => Promise<ToolResponse<unknown>>;
}

export class LocalToolExecutor implements ToolExecutor {
  private readonly dispatcher: Dispatcher;

  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  async callTool(name: string, args: unknown): Promise<ToolResponse<unknown>> {
    const toolName = name as ToolName;
    const response = this.dispatcher.handle(toolName, args as ToolPayloadMap[ToolName]);
    const decorated = decorateToolResponse(name, args, response);
    return normalizeToolResponse(decorated, {
      source: 'mcp_executor',
      ensureReason: true
    });
  }
}




