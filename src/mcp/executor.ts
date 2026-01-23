import { Dispatcher, ToolName, ToolPayloadMap, ToolResponse } from '../types';
import { ProxyRouter } from '../proxy';
import { ProxyTool } from '../spec';

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
      const response = await this.proxy.handle(name, args);
      return normalizeToolResponse(response);
    }
    const toolName = name as ToolName;
    return normalizeToolResponse(this.dispatcher.handle(toolName, args as ToolPayloadMap[ToolName]));
  }
}

const normalizeToolResponse = (response: ToolResponse<unknown>): ToolResponse<unknown> => {
  if (response.ok) return response;
  const details = { ...(response.error.details ?? {}) };
  if (typeof details.reason !== 'string' || details.reason.length === 0) {
    details.reason = response.error.code;
  }
  return { ok: false, error: { ...response.error, details } };
};

const isProxyTool = (name: string): name is ProxyTool =>
  name === 'apply_model_spec' ||
  name === 'apply_texture_spec' ||
  name === 'apply_uv_spec' ||
  name === 'apply_entity_spec';
