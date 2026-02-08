import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { FormatPort } from '../../ports/formats';
import type { ProjectSession } from '../../session';
import type { ProjectStateBuilder } from '../../domain/project/projectStateBuilder';
import type { FormatOverrides } from '../../domain/formats';
import type { UvPolicyConfig } from '../../domain/uv/policy';
import type { UsecaseResult } from '../result';

export interface ProjectServiceDeps {
  session: ProjectSession;
  capabilities: Capabilities;
  editor: EditorPort;
  formats: FormatPort;
  projectState: ProjectStateBuilder;
  revision: {
    track: (snapshot: ReturnType<ProjectSession['snapshot']>) => string;
    hash: (snapshot: ReturnType<ProjectSession['snapshot']>) => string;
    get: (id: string) => ReturnType<ProjectSession['snapshot']> | null;
    remember: (snapshot: ReturnType<ProjectSession['snapshot']>, id: string) => void;
  };
  getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
  texture?: {
    createBlankTexture: (payload: {
      name: string;
      width?: number;
      height?: number;
      background?: string;
      ifRevision?: string;
      allowExisting?: boolean;
    }) => UsecaseResult<{ id: string; name: string; created: boolean }>;
  };
  policies: {
    formatOverrides?: FormatOverrides;
    autoDiscardUnsaved?: boolean;
    autoCreateProjectTexture?: boolean;
    uvPolicy?: UvPolicyConfig;
  };
}

