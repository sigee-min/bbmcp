import type { ToolError } from '../types';
import type { FormatOverrides } from '../services/format';
import type { ExportPolicy, SnapshotPolicy } from './policies';
import type { UvPolicyConfig } from '../domain/uvPolicy';

export interface PolicyContextLike {
  getSnapshotPolicy(): SnapshotPolicy;
  getFormatOverrides(): FormatOverrides | undefined;
  getExportPolicy(): ExportPolicy | undefined;
  getAutoDiscardUnsaved(): boolean | undefined;
  getAutoAttachActiveProject(): boolean | undefined;
  isRevisionRequired(): boolean;
  isAutoRetryRevisionEnabled(): boolean;
  getUvPolicyConfig(): UvPolicyConfig;
}

export interface SnapshotContextLike<TSnapshot = unknown> {
  getSnapshot(): TSnapshot;
  ensureActive(): ToolError | null;
}

export interface RevisionContextLike {
  ensureRevisionMatch(expected?: string): ToolError | null;
  runWithoutRevisionGuard<T>(fn: () => T): T;
  runWithoutRevisionGuardAsync<T>(fn: () => Promise<T> | T): Promise<T>;
}
