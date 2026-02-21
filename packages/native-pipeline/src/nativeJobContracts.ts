export type NativeJobStatus = 'queued' | 'running' | 'completed' | 'failed';

const SUPPORTED_NATIVE_JOB_KINDS = ['gltf.convert', 'texture.preflight'] as const;

export type SupportedNativeJobKind = (typeof SUPPORTED_NATIVE_JOB_KINDS)[number];

const supportedNativeJobKindSet = new Set<string>(SUPPORTED_NATIVE_JOB_KINDS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const TEXTURE_FACE_DIRECTIONS = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
type NativeTextureFaceDirection = (typeof TEXTURE_FACE_DIRECTIONS)[number];

const isTextureFaceDirection = (value: unknown): value is NativeTextureFaceDirection =>
  typeof value === 'string' && TEXTURE_FACE_DIRECTIONS.includes(value as NativeTextureFaceDirection);

const isRotationQuarter = (value: unknown): value is 0 | 1 | 2 | 3 =>
  value === 0 || value === 1 || value === 2 || value === 3;

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

interface GltfConvertJobPayload {
  codecId?: string;
  optimize?: boolean;
}

interface TexturePreflightJobPayload {
  textureIds?: string[];
  maxDimension?: number;
  allowNonPowerOfTwo?: boolean;
}

export type NativeJobPayloadMap = {
  'gltf.convert': GltfConvertJobPayload;
  'texture.preflight': TexturePreflightJobPayload;
};

interface NativeJobResultBase<TKind extends SupportedNativeJobKind> {
  kind: TKind;
  processedBy?: string;
  attemptCount?: number;
  finishedAt?: string;
  diagnostics?: string[];
  output?: Record<string, unknown>;
}

interface NativeHierarchyResultNode {
  id: string;
  name: string;
  kind: 'bone' | 'cube';
  children: NativeHierarchyResultNode[];
}

interface NativeAnimationSummary {
  id: string;
  name: string;
  length: number;
  loop: boolean;
}

interface NativeTextureFaceSourceSummary {
  faceId: string;
  cubeId: string;
  cubeName: string;
  direction: NativeTextureFaceDirection;
  colorHex: string;
  rotationQuarter: 0 | 1 | 2 | 3;
}

interface NativeTextureAtlasFaceSummary {
  faceId: string;
  cubeId: string;
  cubeName: string;
  direction: NativeTextureFaceDirection;
  rotationQuarter: 0 | 1 | 2 | 3;
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

interface NativeTextureUvEdgeSummary {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface NativeTextureAtlasSummary {
  textureId: string;
  name: string;
  width: number;
  height: number;
  faceCount: number;
  imageDataUrl: string;
  faces: NativeTextureAtlasFaceSummary[];
  uvEdges: NativeTextureUvEdgeSummary[];
}

interface GltfConvertJobResult extends NativeJobResultBase<'gltf.convert'> {
  status?: 'converted' | 'noop' | 'failed';
  hasGeometry?: boolean;
  geometryDelta?: {
    bones?: number;
    cubes?: number;
  };
  hierarchy?: NativeHierarchyResultNode[];
  animations?: NativeAnimationSummary[];
  textureSources?: NativeTextureFaceSourceSummary[];
  textures?: NativeTextureAtlasSummary[];
}

interface TexturePreflightJobResult extends NativeJobResultBase<'texture.preflight'> {
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

  if (result.hierarchy !== undefined) {
    if (!Array.isArray(result.hierarchy)) {
      throw new NativeJobContractError('result.hierarchy must be an array');
    }
    const parseHierarchyNode = (value: unknown): NativeHierarchyResultNode => {
      if (!isRecord(value)) {
        throw new NativeJobContractError('result.hierarchy node must be an object');
      }
      if (typeof value.id !== 'string' || value.id.trim().length === 0) {
        throw new NativeJobContractError('result.hierarchy node.id must be a non-empty string');
      }
      if (typeof value.name !== 'string' || value.name.trim().length === 0) {
        throw new NativeJobContractError('result.hierarchy node.name must be a non-empty string');
      }
      if (value.kind !== 'bone' && value.kind !== 'cube') {
        throw new NativeJobContractError("result.hierarchy node.kind must be 'bone' or 'cube'");
      }
      if (!Array.isArray(value.children)) {
        throw new NativeJobContractError('result.hierarchy node.children must be an array');
      }
      return {
        id: value.id,
        name: value.name,
        kind: value.kind,
        children: value.children.map((child) => parseHierarchyNode(child))
      };
    };
    normalized.hierarchy = result.hierarchy.map((entry) => parseHierarchyNode(entry));
  }

  if (result.animations !== undefined) {
    if (!Array.isArray(result.animations)) {
      throw new NativeJobContractError('result.animations must be an array');
    }
    normalized.animations = result.animations.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new NativeJobContractError('result.animations entry must be an object');
      }
      if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
        throw new NativeJobContractError(`result.animations[${index}].id must be a non-empty string`);
      }
      if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        throw new NativeJobContractError(`result.animations[${index}].name must be a non-empty string`);
      }
      if (typeof entry.length !== 'number' || !Number.isFinite(entry.length) || entry.length < 0) {
        throw new NativeJobContractError(`result.animations[${index}].length must be a non-negative number`);
      }
      if (typeof entry.loop !== 'boolean') {
        throw new NativeJobContractError(`result.animations[${index}].loop must be a boolean`);
      }
      return {
        id: entry.id,
        name: entry.name,
        length: entry.length,
        loop: entry.loop
      };
    });
  }

  if (result.textureSources !== undefined) {
    if (!Array.isArray(result.textureSources)) {
      throw new NativeJobContractError('result.textureSources must be an array');
    }
    normalized.textureSources = result.textureSources.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new NativeJobContractError('result.textureSources entry must be an object');
      }
      if (typeof entry.faceId !== 'string' || entry.faceId.trim().length === 0) {
        throw new NativeJobContractError(`result.textureSources[${index}].faceId must be a non-empty string`);
      }
      if (typeof entry.cubeId !== 'string' || entry.cubeId.trim().length === 0) {
        throw new NativeJobContractError(`result.textureSources[${index}].cubeId must be a non-empty string`);
      }
      if (typeof entry.cubeName !== 'string' || entry.cubeName.trim().length === 0) {
        throw new NativeJobContractError(`result.textureSources[${index}].cubeName must be a non-empty string`);
      }
      if (!isTextureFaceDirection(entry.direction)) {
        throw new NativeJobContractError(`result.textureSources[${index}].direction must be a valid cube face direction`);
      }
      if (typeof entry.colorHex !== 'string' || entry.colorHex.trim().length === 0) {
        throw new NativeJobContractError(`result.textureSources[${index}].colorHex must be a non-empty string`);
      }
      if (!isRotationQuarter(entry.rotationQuarter)) {
        throw new NativeJobContractError(`result.textureSources[${index}].rotationQuarter must be one of 0, 1, 2, 3`);
      }
      return {
        faceId: entry.faceId,
        cubeId: entry.cubeId,
        cubeName: entry.cubeName,
        direction: entry.direction,
        colorHex: entry.colorHex,
        rotationQuarter: entry.rotationQuarter
      };
    });
  }

  if (result.textures !== undefined) {
    if (!Array.isArray(result.textures)) {
      throw new NativeJobContractError('result.textures must be an array');
    }
    normalized.textures = result.textures.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new NativeJobContractError('result.textures entry must be an object');
      }
      if (typeof entry.textureId !== 'string' || entry.textureId.trim().length === 0) {
        throw new NativeJobContractError(`result.textures[${index}].textureId must be a non-empty string`);
      }
      if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        throw new NativeJobContractError(`result.textures[${index}].name must be a non-empty string`);
      }
      if (typeof entry.width !== 'number' || !Number.isFinite(entry.width) || entry.width < 0) {
        throw new NativeJobContractError(`result.textures[${index}].width must be a non-negative number`);
      }
      if (typeof entry.height !== 'number' || !Number.isFinite(entry.height) || entry.height < 0) {
        throw new NativeJobContractError(`result.textures[${index}].height must be a non-negative number`);
      }
      if (typeof entry.faceCount !== 'number' || !Number.isFinite(entry.faceCount) || entry.faceCount < 0) {
        throw new NativeJobContractError(`result.textures[${index}].faceCount must be a non-negative number`);
      }
      if (typeof entry.imageDataUrl !== 'string' || entry.imageDataUrl.trim().length === 0) {
        throw new NativeJobContractError(`result.textures[${index}].imageDataUrl must be a non-empty string`);
      }
      if (!Array.isArray(entry.faces)) {
        throw new NativeJobContractError(`result.textures[${index}].faces must be an array`);
      }
      if (!Array.isArray(entry.uvEdges)) {
        throw new NativeJobContractError(`result.textures[${index}].uvEdges must be an array`);
      }

      const faces = entry.faces.map((face, faceIndex) => {
        if (!isRecord(face)) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}] must be an object`);
        }
        if (typeof face.faceId !== 'string' || face.faceId.trim().length === 0) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].faceId must be a non-empty string`);
        }
        if (typeof face.cubeId !== 'string' || face.cubeId.trim().length === 0) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].cubeId must be a non-empty string`);
        }
        if (typeof face.cubeName !== 'string' || face.cubeName.trim().length === 0) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].cubeName must be a non-empty string`);
        }
        if (!isTextureFaceDirection(face.direction)) {
          throw new NativeJobContractError(
            `result.textures[${index}].faces[${faceIndex}].direction must be a valid cube face direction`
          );
        }
        if (!isRotationQuarter(face.rotationQuarter)) {
          throw new NativeJobContractError(
            `result.textures[${index}].faces[${faceIndex}].rotationQuarter must be one of 0, 1, 2, 3`
          );
        }
        if (typeof face.uMin !== 'number' || !Number.isFinite(face.uMin)) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].uMin must be a finite number`);
        }
        if (typeof face.vMin !== 'number' || !Number.isFinite(face.vMin)) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].vMin must be a finite number`);
        }
        if (typeof face.uMax !== 'number' || !Number.isFinite(face.uMax)) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].uMax must be a finite number`);
        }
        if (typeof face.vMax !== 'number' || !Number.isFinite(face.vMax)) {
          throw new NativeJobContractError(`result.textures[${index}].faces[${faceIndex}].vMax must be a finite number`);
        }
        return {
          faceId: face.faceId,
          cubeId: face.cubeId,
          cubeName: face.cubeName,
          direction: face.direction,
          rotationQuarter: face.rotationQuarter,
          uMin: face.uMin,
          vMin: face.vMin,
          uMax: face.uMax,
          vMax: face.vMax
        };
      });

      const uvEdges = entry.uvEdges.map((edge, edgeIndex) => {
        if (!isRecord(edge)) {
          throw new NativeJobContractError(`result.textures[${index}].uvEdges[${edgeIndex}] must be an object`);
        }
        if (typeof edge.x1 !== 'number' || !Number.isFinite(edge.x1)) {
          throw new NativeJobContractError(`result.textures[${index}].uvEdges[${edgeIndex}].x1 must be a finite number`);
        }
        if (typeof edge.y1 !== 'number' || !Number.isFinite(edge.y1)) {
          throw new NativeJobContractError(`result.textures[${index}].uvEdges[${edgeIndex}].y1 must be a finite number`);
        }
        if (typeof edge.x2 !== 'number' || !Number.isFinite(edge.x2)) {
          throw new NativeJobContractError(`result.textures[${index}].uvEdges[${edgeIndex}].x2 must be a finite number`);
        }
        if (typeof edge.y2 !== 'number' || !Number.isFinite(edge.y2)) {
          throw new NativeJobContractError(`result.textures[${index}].uvEdges[${edgeIndex}].y2 must be a finite number`);
        }
        return {
          x1: edge.x1,
          y1: edge.y1,
          x2: edge.x2,
          y2: edge.y2
        };
      });

      return {
        textureId: entry.textureId,
        name: entry.name,
        width: entry.width,
        height: entry.height,
        faceCount: entry.faceCount,
        imageDataUrl: entry.imageDataUrl,
        faces,
        uvEdges
      };
    });
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
