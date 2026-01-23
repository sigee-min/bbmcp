import { FormatKind } from './shared';
import type { Limits } from '../domain/model';

export interface Capability {
  format: FormatKind;
  animations: boolean;
  enabled: boolean;
}

export type { Limits };

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

export interface Capabilities {
  pluginVersion: string;
  toolSchemaVersion?: string;
  toolRegistry?: ToolRegistryInfo;
  blockbenchVersion: string;
  formats: Capability[];
  limits: Limits;
  preview?: PreviewCapability;
  guidance?: CapabilitiesGuidance;
}
