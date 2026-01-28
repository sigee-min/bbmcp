import { Dispatcher, ToolName, ToolPayloadMap, ToolResponse } from '../types';
import { ProxyRouter } from '../proxy';
import type { ProxyToolPayloadMap } from '../proxy/types';
import { ProxyTool } from '../spec';
import { PROXY_TOOL_NAMES } from '../shared/toolConstants';
import { normalizeToolResponse } from '../services/toolResponseGuard';

export interface ToolExecutor {
  callTool: (name: string, args: unknown) => Promise<ToolResponse<unknown>>;
}

export class LocalToolExecutor implements ToolExecutor {
  private readonly dispatcher: Dispatcher;
  private readonly proxy: ProxyRouter;

  constructor(dispatcher: Dispatcher, proxy: ProxyRouter) {
    this.dispatcher = dispatcher;
    this.proxy = proxy;
  }

  async callTool(name: string, args: unknown): Promise<ToolResponse<unknown>> {
    if (isProxyTool(name)) {
      const response = await this.proxy.handle(name, args as ProxyToolPayloadMap[ProxyTool]);
      return normalizeToolResponse(response, { source: 'mcp_executor', ensureReason: true });
    }
    const toolName = name as ToolName;
    return normalizeToolResponse(this.dispatcher.handle(toolName, args as ToolPayloadMap[ToolName]), {
      source: 'mcp_executor',
      ensureReason: true
    });
  }
}

const PROXY_TOOL_SET = new Set<string>(PROXY_TOOL_NAMES);

const isProxyTool = (name: string): name is ProxyTool => PROXY_TOOL_SET.has(name);
