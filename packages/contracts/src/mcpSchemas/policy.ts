import type { JsonSchema } from './types';

export const TOOL_SCHEMA_VERSION = '2026-02-09';

export type ToolRegistryHashEntry = {
  name: string;
  inputSchema: JsonSchema;
};

const hashTextToHex = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const buildToolRegistrySignature = (tools: ReadonlyArray<ToolRegistryHashEntry>): string =>
  JSON.stringify(tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })));

export const computeToolRegistryHash = (tools: ReadonlyArray<ToolRegistryHashEntry>): string =>
  hashTextToHex(buildToolRegistrySignature(tools));
