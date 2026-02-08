import type { FormatKind } from './shared';

export type Limits = {
  maxCubes: number;
  maxTextureSize: number;
  maxAnimationSeconds: number;
};

export interface Capability {
  format: FormatKind;
  animations: boolean;
  enabled: boolean;
  flags?: {
    singleTexture?: boolean;
    perTextureUvSize?: boolean;
    boxUv?: boolean;
    optionalBoxUv?: boolean;
    uvRotation?: boolean;
    animationMode?: boolean;
    boneRig?: boolean;
    armatureRig?: boolean;
    meshes?: boolean;
    imageEditor?: boolean;
  };
}

export interface PreviewCapability {
  pngOnly: boolean;
  fixedOutput: 'single';
  turntableOutput: 'sequence';
  response: 'dataUri' | 'content' | 'content+dataUri';
}

export interface CapabilitiesGuidance {
  toolPathStability: {
    cache: 'no' | 'yes';
    note: string;
  };
  mutationPolicy: {
    requiresRevision: boolean;
    note: string;
  };
  retryPolicy?: {
    maxAttempts: number;
    onErrors: string[];
    steps: string[];
  };
  rediscovery?: {
    refetchTools: boolean;
    refreshState: boolean;
    methods: string[];
  };
  textureStrategy: {
    note: string;
  };
}

export interface ToolRegistryInfo {
  hash: string;
  count: number;
}

export interface ExportTargetCapability {
  kind: 'internal' | 'native_codec';
  id: string;
  label: string;
  extensions?: string[];
  available: boolean;
}

export interface Capabilities {
  pluginVersion: string;
  toolSchemaVersion?: string;
  toolRegistry?: ToolRegistryInfo;
  blockbenchVersion: string;
  formats: Capability[];
  exportTargets?: ExportTargetCapability[];
  limits: Limits;
  preview?: PreviewCapability;
  guidance?: CapabilitiesGuidance;
}
