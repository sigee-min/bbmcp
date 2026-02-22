import type { BackendPort } from '@ashfox/backend-core';
import type { ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import type { Logger } from '@ashfox/runtime/logging';

export const createNoopLogger = (): Logger => ({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
});

export const createBackendStub = (
  handler: <TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ) => Promise<ToolResponse<ToolResultMap[TName]>> | ToolResponse<ToolResultMap[TName]>
): BackendPort => ({
  kind: 'engine',
  getHealth: async () => ({
    kind: 'engine',
    availability: 'ready',
    version: 'test',
    details: {
      persistence: {
        database: { provider: 'memory', ready: true },
        storage: { provider: 'memory', ready: true }
      }
    }
  }),
  handleTool: async (name, payload) => handler(name, payload)
});
