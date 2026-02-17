export type NativeJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export const SUPPORTED_NATIVE_JOB_KINDS = ['gltf.convert', 'texture.preflight'] as const;

export type SupportedNativeJobKind = (typeof SUPPORTED_NATIVE_JOB_KINDS)[number];

const supportedNativeJobKindSet = new Set<string>(SUPPORTED_NATIVE_JOB_KINDS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const assertKnownKeys = (payload: Record<string, unknown>, allowedKeys: readonly string[], kind: SupportedNativeJobKind): void => {
  const unknown = Object.keys(payload).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw new NativeJobContractError(`payload has unsupported field(s) for ${kind}: ${unknown.join(', ')}`);
  }
};

const normalizeDiagnostics = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new NativeJobContractError('result.diagnostics must be an array of strings');
  }
  return [...value];
};

const normalizePayloadRecord = (payload: unknown): Record<string, unknown> | undefined => {
  if (payload === undefined) return undefined;
  if (!isRecord(payload)) {
    throw new NativeJobContractError('payload must be an object');
  }
  return payload;
};

const normalizeResultRecord = (result: unknown): Record<string, unknown> | undefined => {
  if (result === undefined) return undefined;
  if (!isRecord(result)) {
    throw new NativeJobContractError('result must be an object');
  }
  return result;
};

export const isSupportedNativeJobKind = (value: string): value is SupportedNativeJobKind =>
  supportedNativeJobKindSet.has(value);

export const normalizeSupportedNativeJobKind = (value: unknown): SupportedNativeJobKind => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NativeJobContractError('kind is required');
  }
  const normalized = value.trim();
  if (!isSupportedNativeJobKind(normalized)) {
    throw new NativeJobContractError(`kind must be one of: ${SUPPORTED_NATIVE_JOB_KINDS.join(', ')}`);
  }
  return normalized;
};

export class NativeJobContractError extends Error {
  readonly code = 'invalid_payload';

  constructor(message: string) {
    super(message);
    this.name = 'NativeJobContractError';
  }
}

export interface GltfConvertJobPayload {
  codecId?: string;
  optimize?: boolean;
}

export interface TexturePreflightJobPayload {
  textureIds?: string[];
  maxDimension?: number;
  allowNonPowerOfTwo?: boolean;
}

export type NativeJobPayloadMap = {
  'gltf.convert': GltfConvertJobPayload;
  'texture.preflight': TexturePreflightJobPayload;
};

export interface NativeJobResultBase<TKind extends SupportedNativeJobKind> {
  kind: TKind;
  processedBy?: string;
  attemptCount?: number;
  finishedAt?: string;
  diagnostics?: string[];
  output?: Record<string, unknown>;
}

export interface GltfConvertJobResult extends NativeJobResultBase<'gltf.convert'> {
  status?: 'converted' | 'noop' | 'failed';
  hasGeometry?: boolean;
  geometryDelta?: {
    bones?: number;
    cubes?: number;
  };
}

export interface TexturePreflightJobResult extends NativeJobResultBase<'texture.preflight'> {
  status?: 'passed' | 'failed';
  summary?: {
    checked: number;
    oversized: number;
    nonPowerOfTwo: number;
  };
}

export type NativeJobResultMap = {
  'gltf.convert': GltfConvertJobResult;
  'texture.preflight': TexturePreflightJobResult;
};

export type NativeJobResult = NativeJobResultMap[SupportedNativeJobKind];

const normalizeGltfConvertPayload = (payload: unknown): GltfConvertJobPayload | undefined => {
  const record = normalizePayloadRecord(payload);
  if (!record) return undefined;

  assertKnownKeys(record, ['codecId', 'optimize'], 'gltf.convert');

  const normalized: GltfConvertJobPayload = {};
  if (record.codecId !== undefined) {
    if (!isNonEmptyString(record.codecId)) {
      throw new NativeJobContractError('payload.codecId must be a non-empty string');
    }
    normalized.codecId = record.codecId;
  }
  if (record.optimize !== undefined) {
    if (typeof record.optimize !== 'boolean') {
      throw new NativeJobContractError('payload.optimize must be a boolean');
    }
    normalized.optimize = record.optimize;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeTexturePreflightPayload = (payload: unknown): TexturePreflightJobPayload | undefined => {
  const record = normalizePayloadRecord(payload);
  if (!record) return undefined;

  assertKnownKeys(record, ['textureIds', 'maxDimension', 'allowNonPowerOfTwo'], 'texture.preflight');

  const normalized: TexturePreflightJobPayload = {};

  if (record.textureIds !== undefined) {
    if (
      !Array.isArray(record.textureIds) ||
      record.textureIds.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
    ) {
      throw new NativeJobContractError('payload.textureIds must be an array of non-empty strings');
    }
    normalized.textureIds = [...record.textureIds];
  }

  if (record.maxDimension !== undefined) {
    if (!isPositiveInteger(record.maxDimension)) {
      throw new NativeJobContractError('payload.maxDimension must be a positive integer');
    }
    normalized.maxDimension = record.maxDimension;
  }

  if (record.allowNonPowerOfTwo !== undefined) {
    if (typeof record.allowNonPowerOfTwo !== 'boolean') {
      throw new NativeJobContractError('payload.allowNonPowerOfTwo must be a boolean');
    }
    normalized.allowNonPowerOfTwo = record.allowNonPowerOfTwo;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeGltfConvertResult = (result: Record<string, unknown>): GltfConvertJobResult => {
  const kind = result.kind;
  if (kind !== 'gltf.convert') {
    throw new NativeJobContractError("result.kind must be 'gltf.convert'");
  }

  const normalized: GltfConvertJobResult = { kind: 'gltf.convert' };

  if (result.processedBy !== undefined) {
    if (!isNonEmptyString(result.processedBy)) {
      throw new NativeJobContractError('result.processedBy must be a non-empty string');
    }
    normalized.processedBy = result.processedBy;
  }

  if (result.attemptCount !== undefined) {
    if (!isPositiveInteger(result.attemptCount)) {
      throw new NativeJobContractError('result.attemptCount must be a positive integer');
    }
    normalized.attemptCount = result.attemptCount;
  }

  if (result.finishedAt !== undefined) {
    if (!isNonEmptyString(result.finishedAt)) {
      throw new NativeJobContractError('result.finishedAt must be a non-empty string');
    }
    normalized.finishedAt = result.finishedAt;
  }

  if (result.status !== undefined) {
    if (result.status !== 'converted' && result.status !== 'noop' && result.status !== 'failed') {
      throw new NativeJobContractError("result.status must be one of: converted, noop, failed");
    }
    normalized.status = result.status;
  }

  if (result.hasGeometry !== undefined) {
    if (typeof result.hasGeometry !== 'boolean') {
      throw new NativeJobContractError('result.hasGeometry must be a boolean');
    }
    normalized.hasGeometry = result.hasGeometry;
  }

  if (result.geometryDelta !== undefined) {
    if (!isRecord(result.geometryDelta)) {
      throw new NativeJobContractError('result.geometryDelta must be an object');
    }
    const delta: NonNullable<GltfConvertJobResult['geometryDelta']> = {};
    if (result.geometryDelta.bones !== undefined) {
      if (!isInteger(result.geometryDelta.bones)) {
        throw new NativeJobContractError('result.geometryDelta.bones must be an integer');
      }
      delta.bones = result.geometryDelta.bones;
    }
    if (result.geometryDelta.cubes !== undefined) {
      if (!isInteger(result.geometryDelta.cubes)) {
        throw new NativeJobContractError('result.geometryDelta.cubes must be an integer');
      }
      delta.cubes = result.geometryDelta.cubes;
    }
    normalized.geometryDelta = delta;
  }

  const diagnostics = normalizeDiagnostics(result.diagnostics);
  if (diagnostics) {
    normalized.diagnostics = diagnostics;
  }

  if (result.output !== undefined) {
    if (!isRecord(result.output)) {
      throw new NativeJobContractError('result.output must be an object');
    }
    normalized.output = { ...result.output };
  }

  return normalized;
};

const normalizeTexturePreflightSummary = (
  value: unknown
): TexturePreflightJobResult['summary'] | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new NativeJobContractError('result.summary must be an object');
  }
  const { checked, oversized, nonPowerOfTwo } = value;
  if (!isPositiveInteger(checked) && checked !== 0) {
    throw new NativeJobContractError('result.summary.checked must be a non-negative integer');
  }
  if (!isPositiveInteger(oversized) && oversized !== 0) {
    throw new NativeJobContractError('result.summary.oversized must be a non-negative integer');
  }
  if (!isPositiveInteger(nonPowerOfTwo) && nonPowerOfTwo !== 0) {
    throw new NativeJobContractError('result.summary.nonPowerOfTwo must be a non-negative integer');
  }
  return {
    checked,
    oversized,
    nonPowerOfTwo
  };
};

const normalizeTexturePreflightResult = (result: Record<string, unknown>): TexturePreflightJobResult => {
  const kind = result.kind;
  if (kind !== 'texture.preflight') {
    throw new NativeJobContractError("result.kind must be 'texture.preflight'");
  }

  const normalized: TexturePreflightJobResult = { kind: 'texture.preflight' };

  if (result.processedBy !== undefined) {
    if (!isNonEmptyString(result.processedBy)) {
      throw new NativeJobContractError('result.processedBy must be a non-empty string');
    }
    normalized.processedBy = result.processedBy;
  }

  if (result.attemptCount !== undefined) {
    if (!isPositiveInteger(result.attemptCount)) {
      throw new NativeJobContractError('result.attemptCount must be a positive integer');
    }
    normalized.attemptCount = result.attemptCount;
  }

  if (result.finishedAt !== undefined) {
    if (!isNonEmptyString(result.finishedAt)) {
      throw new NativeJobContractError('result.finishedAt must be a non-empty string');
    }
    normalized.finishedAt = result.finishedAt;
  }

  if (result.status !== undefined) {
    if (result.status !== 'passed' && result.status !== 'failed') {
      throw new NativeJobContractError("result.status must be one of: passed, failed");
    }
    normalized.status = result.status;
  }

  const diagnostics = normalizeDiagnostics(result.diagnostics);
  if (diagnostics) {
    normalized.diagnostics = diagnostics;
  }

  const summary = normalizeTexturePreflightSummary(result.summary);
  if (summary) {
    normalized.summary = summary;
  }

  if (result.output !== undefined) {
    if (!isRecord(result.output)) {
      throw new NativeJobContractError('result.output must be an object');
    }
    normalized.output = { ...result.output };
  }

  return normalized;
};

export const normalizeNativeJobPayload = <TKind extends SupportedNativeJobKind>(
  kind: TKind,
  payload: unknown
): NativeJobPayloadMap[TKind] | undefined => {
  if (kind === 'gltf.convert') {
    return normalizeGltfConvertPayload(payload) as NativeJobPayloadMap[TKind] | undefined;
  }
  return normalizeTexturePreflightPayload(payload) as NativeJobPayloadMap[TKind] | undefined;
};

export const normalizeNativeJobResult = <TKind extends SupportedNativeJobKind>(
  kind: TKind,
  result: unknown
): NativeJobResultMap[TKind] | undefined => {
  const normalized = normalizeResultRecord(result);
  if (!normalized) return undefined;
  if (kind === 'gltf.convert') {
    return normalizeGltfConvertResult(normalized) as NativeJobResultMap[TKind];
  }
  return normalizeTexturePreflightResult(normalized) as NativeJobResultMap[TKind];
};

export interface NativeProjectSnapshot {
  projectId: string;
  name: string;
  revision: number;
  hasGeometry: boolean;
  focusAnchor?: readonly [number, number, number];
  hierarchy: Array<{
    id: string;
    name: string;
    kind: 'bone' | 'cube';
    children: Array<{
      id: string;
      name: string;
      kind: 'bone' | 'cube';
      children: never[];
    }>;
  }>;
  animations: Array<{
    id: string;
    name: string;
    length: number;
    loop: boolean;
  }>;
  stats: {
    bones: number;
    cubes: number;
  };
  activeJob?: {
    id: string;
    status: NativeJobStatus;
  };
}

export type NativeJob = {
  id: string;
  projectId: string;
  status: NativeJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseMs: number;
  createdAt: string;
  startedAt?: string;
  leaseExpiresAt?: string;
  nextRetryAt?: string;
  completedAt?: string;
  workerId?: string;
  error?: string;
  deadLetter?: boolean;
} & {
  [TKind in SupportedNativeJobKind]: {
    kind: TKind;
    payload?: NativeJobPayloadMap[TKind];
    result?: NativeJobResultMap[TKind];
  }
}[SupportedNativeJobKind];

export interface NativeProjectEvent {
  seq: number;
  event: 'project_snapshot';
  data: NativeProjectSnapshot;
}

export type NativeJobSubmitInput = {
  projectId: string;
  maxAttempts?: number;
  leaseMs?: number;
} & {
  [TKind in SupportedNativeJobKind]: {
    kind: TKind;
    payload?: NativeJobPayloadMap[TKind];
  }
}[SupportedNativeJobKind];
