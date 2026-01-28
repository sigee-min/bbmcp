import type { SidecarLaunchConfig } from '../sidecar/types';
import type { BlockbenchGlobals } from '../types/blockbench';

export type ReadGlobals = () => BlockbenchGlobals;

export type ServerSettings = SidecarLaunchConfig & {
  enabled: boolean;
  autoDiscardUnsaved: boolean;
  autoAttachActiveProject: boolean;
  autoIncludeState: boolean;
  autoIncludeDiff: boolean;
  requireRevision: boolean;
  autoRetryRevision: boolean;
  exposeLowLevelTools: boolean;
};
