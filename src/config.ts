import { Capabilities, Capability, Limits, FormatKind, PreviewCapability } from './types';
import { FormatDescriptor } from './ports/formats';
import { FormatOverrides, resolveFormatId } from './domain/format';

export const PLUGIN_ID = 'bbmcp';
export const PLUGIN_VERSION = '0.0.2';
export const TOOL_SCHEMA_VERSION = '2025-03-23';
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const DEFAULT_SERVER_PORT = 8787;
export const DEFAULT_SERVER_PATH = '/mcp';

const DEFAULT_LIMITS: Limits = {
  maxCubes: 2048,
  maxTextureSize: 2048,
  maxAnimationSeconds: 120
};

const BASE_FORMATS: Array<{ format: FormatKind; animations: boolean }> = [
  { format: 'vanilla', animations: false },
  { format: 'geckolib', animations: true },
  { format: 'animated_java', animations: true }
];

const CAPABILITIES_GUIDANCE = {
  toolPathStability: {
    cache: 'no' as const,
    note:
      'Tool paths like /bbmcp/link_... are session-bound and can change after reconnects. Never cache tool paths; re-discover tools when a request returns Resource not found.'
  },
  retryPolicy: {
    maxAttempts: 2,
    onErrors: ['resource_not_found', 'invalid_state', 'invalid_state_revision_mismatch', 'tool_registry_empty'],
    steps: ['tools_list', 'refresh_state', 'retry_once']
  },
  rediscovery: {
    refetchTools: true,
    refreshState: true,
    methods: ['tools/list', 'list_capabilities', 'get_project_state']
  }
};

const computeFormatCapabilities = (
  formats: FormatDescriptor[],
  overrides?: FormatOverrides
): Capability[] =>
  BASE_FORMATS.map((base) => {
    const resolved = resolveFormatId(base.format, formats, overrides);
    return { ...base, enabled: Boolean(resolved) };
  });

export function computeCapabilities(
  blockbenchVersion: string | undefined,
  formats: FormatDescriptor[] = [],
  overrides?: FormatOverrides,
  preview?: PreviewCapability
): Capabilities {
  return {
    pluginVersion: PLUGIN_VERSION,
    toolSchemaVersion: TOOL_SCHEMA_VERSION,
    blockbenchVersion: blockbenchVersion ?? 'unknown',
    formats: computeFormatCapabilities(formats, overrides),
    limits: DEFAULT_LIMITS,
    preview,
    guidance: CAPABILITIES_GUIDANCE
  };
}
