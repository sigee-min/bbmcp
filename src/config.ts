import { Capabilities, Capability, Limits, FormatKind, PreviewCapability } from './types/internal';
import { FormatDescriptor } from './ports/formats';
import { FormatOverrides, resolveFormatId } from './domain/formats';
import { TEXTURE_WORKFLOW_INSTRUCTIONS } from './shared/tooling/toolInstructions';
import { TOOL_SCHEMA_VERSION as CONTRACT_TOOL_SCHEMA_VERSION } from '../packages/contracts/src/mcpSchemas/policy';

export const PLUGIN_ID = 'ashfox';
export const PLUGIN_VERSION = '0.0.2'; // x-release-please-version
export const TOOL_SCHEMA_VERSION = CONTRACT_TOOL_SCHEMA_VERSION;
export const DEFAULT_SERVER_HOST = '0.0.0.0';
export const DEFAULT_SERVER_PORT = 8787;
export const DEFAULT_SERVER_PATH = '/mcp';

const DEFAULT_LIMITS: Limits = {
  maxCubes: 2048,
  maxTextureSize: 2048,
  maxAnimationSeconds: 120
};

const BASE_FORMATS: Array<{ format: FormatKind; animations: boolean }> = [
  { format: 'Java Block/Item', animations: false },
  { format: 'geckolib', animations: true },
  { format: 'animated_java', animations: true },
  { format: 'Image', animations: false },
  { format: 'Generic Model', animations: true }
];

const CAPABILITIES_GUIDANCE = {
  toolPathStability: {
    cache: 'no' as const,
    note: 'Tool paths like /ashfox/link_... are session-bound and can change after reconnects. Re-discover tools on Resource not found or when toolRegistry.hash changes (toolSchemaVersion is coarse).'
  },
  mutationPolicy: {
    requiresRevision: true,
    note: 'All mutating tools require ifRevision. Call get_project_state before mutations; the server may auto-retry once on revision mismatch. Prefer ensure_project to reuse active projects.'
  },
  retryPolicy: {
    maxAttempts: 2,
    onErrors: ['resource_not_found', 'invalid_state', 'invalid_state_revision_mismatch', 'tool_registry_empty'],
    steps: ['tools/list', 'refresh_state', 'retry_once']
  },
  rediscovery: {
    refetchTools: true,
    refreshState: true,
    methods: ['tools/list', 'list_capabilities', 'get_project_state']
  },
  textureStrategy: {
    note: TEXTURE_WORKFLOW_INSTRUCTIONS
  }
};

const computeFormatCapabilities = (
  formats: FormatDescriptor[],
  overrides?: FormatOverrides
): Capability[] =>
  BASE_FORMATS.map((base) => {
    const resolved = resolveFormatId(base.format, formats, overrides);
    const descriptor = resolved ? formats.find((format) => format.id === resolved) : undefined;
    const flags = normalizeFormatFlags(descriptor);
    const animations = resolveAnimations(base.animations, descriptor);
    return { format: base.format, animations, enabled: Boolean(resolved), ...(flags ? { flags } : {}) };
  });

const normalizeFormatFlags = (
  descriptor?: FormatDescriptor
): Capability['flags'] | undefined => {
  if (!descriptor) return undefined;
  const flags = {
    singleTexture: descriptor.singleTexture,
    perTextureUvSize: descriptor.perTextureUvSize,
    boxUv: descriptor.boxUv,
    optionalBoxUv: descriptor.optionalBoxUv,
    uvRotation: descriptor.uvRotation,
    animationMode: descriptor.animationMode,
    boneRig: descriptor.boneRig,
    armatureRig: descriptor.armatureRig,
    meshes: descriptor.meshes,
    imageEditor: descriptor.imageEditor
  };
  const hasFlag = Object.values(flags).some((value) => value !== undefined);
  return hasFlag ? flags : undefined;
};

const resolveAnimations = (fallback: boolean, descriptor?: FormatDescriptor): boolean =>
  typeof descriptor?.animationMode === 'boolean' ? descriptor.animationMode : fallback;

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





