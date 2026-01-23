import type { FormatOverrides } from '../services/format';
import type { RigMergeStrategy } from '../domain/rig';

export type SnapshotPolicy = 'session' | 'live' | 'hybrid';

export type ExportPolicy = 'strict' | 'best_effort';

export interface ToolPolicies {
  formatOverrides?: FormatOverrides;
  snapshotPolicy?: SnapshotPolicy;
  rigMergeStrategy?: RigMergeStrategy;
  exportPolicy?: ExportPolicy;
  autoDiscardUnsaved?: boolean;
  autoAttachActiveProject?: boolean;
  autoIncludeState?: boolean;
  requireRevision?: boolean;
  autoRetryRevision?: boolean;
  uvPolicy?: {
    modelUnitsPerBlock?: number;
    scaleTolerance?: number;
    tinyThreshold?: number;
  };
}
