import type { Logger } from '../../logging';
import type { ResourceStore } from '../../ports/resources';
import type { MetricsRegistry } from '../../observability';
import type { McpServerConfig, JsonRpcResponse } from './types';
import type { ToolExecutor } from './executor';
import type { SessionStore } from './session';
import type { ToolRegistry } from './tools';

export type RpcOutcome =
  | { type: 'notification' }
  | { type: 'response'; response: JsonRpcResponse; status: number };

export type RpcContext = {
  executor: ToolExecutor;
  log: Logger;
  metrics?: MetricsRegistry;
  resources?: ResourceStore;
  toolRegistry: ToolRegistry;
  sessions: SessionStore;
  supportedProtocols?: string[];
  config: McpServerConfig;
};
