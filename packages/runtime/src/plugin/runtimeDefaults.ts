import type { AnimationTimePolicy } from '../domain/animation/timePolicy';
import type { ExportPolicy } from '../usecases/policies';
import type { FormatOverrides } from '../domain/formats';
import { DEFAULT_UV_POLICY } from '../domain/uv/policy';

export const TRACE_LOG_MAX_KB = 2048;

export const createDefaultPolicies = (formatOverrides: FormatOverrides) => ({
  formatOverrides,
  snapshotPolicy: 'hybrid' as const,
  exportPolicy: 'strict' as ExportPolicy,
  uvPolicy: { ...DEFAULT_UV_POLICY },
  autoDiscardUnsaved: true,
  autoAttachActiveProject: true,
  autoIncludeState: false,
  autoIncludeDiff: false,
  requireRevision: true,
  autoRetryRevision: true,
  autoCreateProjectTexture: true,
  animationTimePolicy: {
    timeEpsilon: 1e-9,
    triggerDedupeByValue: true
  } satisfies AnimationTimePolicy
});

export const createTraceLogDefaults = () => ({
  enabled: true,
  mode: 'writeFile' as const,
  destPath: '',
  fileName: 'ashfox-trace.ndjson',
  resourceEnabled: true,
  maxEntries: 2000,
  maxBytes: TRACE_LOG_MAX_KB * 1024,
  minEntries: 1,
  flushEvery: 1,
  flushIntervalMs: 0
});

