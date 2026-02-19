import { synchronizeProjectSnapshot } from './projectSnapshotSync';
import {
  isSupportedNativeJobKind,
  normalizeNativeJobPayload,
  normalizeNativeJobResult,
  type NativeHierarchyNode,
  type NativeJob,
  type NativeProjectLock,
  type NativeProjectLockMode,
  type NativeJobStatus,
  type NativeProjectEvent,
  type NativeProjectFolder,
  type NativeProjectSnapshot,
  type NativeTextureAtlas,
  type NativeTextureAtlasFaceRef,
  type NativeTextureFaceDirection,
  type NativeTextureFaceSource,
  type NativeTextureUvEdge,
  type NativeTreeChildRef
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const normalizeCounter = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const next = Math.trunc(value);
  return next < 1 ? fallback : next;
};

const isNativeJobStatus = (value: unknown): value is NativeJobStatus =>
  value === 'queued' || value === 'running' || value === 'completed' || value === 'failed';

const isProjectLockMode = (value: unknown): value is NativeProjectLockMode => value === 'mcp';

export const asTreeChildRef = (value: unknown): NativeTreeChildRef | null => {
  if (!isRecord(value)) return null;
  if (value.kind !== 'folder' && value.kind !== 'project') return null;
  if (typeof value.id !== 'string') return null;
  return {
    kind: value.kind,
    id: value.id
  };
};

export const asFolder = (value: unknown): NativeProjectFolder | null => {
  if (!isRecord(value)) return null;
  if (typeof value.folderId !== 'string' || typeof value.name !== 'string') return null;
  const parentFolderId =
    value.parentFolderId === null
      ? null
      : typeof value.parentFolderId === 'string'
        ? value.parentFolderId
        : null;
  const children = Array.isArray(value.children)
    ? value.children
        .map((entry) => asTreeChildRef(entry))
        .filter((entry): entry is NativeTreeChildRef => Boolean(entry))
    : [];
  return {
    folderId: value.folderId,
    name: value.name,
    parentFolderId,
    children
  };
};

const asFocusAnchor = (value: unknown): readonly [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof z !== 'number' ||
    !Number.isFinite(z)
  ) {
    return undefined;
  }
  return [x, y, z];
};

const asHierarchyNode = (value: unknown): NativeHierarchyNode | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (value.kind !== 'bone' && value.kind !== 'cube') return null;
  const children = Array.isArray(value.children)
    ? value.children
        .map((entry) => asHierarchyNode(entry))
        .filter((entry): entry is NativeHierarchyNode => Boolean(entry))
    : [];
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    children
  };
};

const isFaceDirection = (value: unknown): value is NativeTextureFaceDirection =>
  value === 'north' || value === 'east' || value === 'south' || value === 'west' || value === 'up' || value === 'down';

const asTextureFaceSource = (value: unknown): NativeTextureFaceSource | null => {
  if (!isRecord(value)) return null;
  if (typeof value.faceId !== 'string' || typeof value.cubeId !== 'string' || typeof value.cubeName !== 'string') return null;
  if (!isFaceDirection(value.direction)) return null;
  if (typeof value.colorHex !== 'string') return null;
  if (typeof value.rotationQuarter !== 'number' || !Number.isFinite(value.rotationQuarter)) return null;
  const rotation = Math.trunc(value.rotationQuarter);
  if (rotation < 0 || rotation > 3) return null;
  return {
    faceId: value.faceId,
    cubeId: value.cubeId,
    cubeName: value.cubeName,
    direction: value.direction,
    colorHex: value.colorHex,
    rotationQuarter: rotation as 0 | 1 | 2 | 3
  };
};

const asTextureFaceRef = (value: unknown): NativeTextureAtlasFaceRef | null => {
  if (!isRecord(value)) return null;
  if (typeof value.faceId !== 'string' || typeof value.cubeId !== 'string' || typeof value.cubeName !== 'string') return null;
  if (!isFaceDirection(value.direction)) return null;
  if (typeof value.rotationQuarter !== 'number' || !Number.isFinite(value.rotationQuarter)) return null;
  if (
    typeof value.uMin !== 'number' ||
    !Number.isFinite(value.uMin) ||
    typeof value.vMin !== 'number' ||
    !Number.isFinite(value.vMin) ||
    typeof value.uMax !== 'number' ||
    !Number.isFinite(value.uMax) ||
    typeof value.vMax !== 'number' ||
    !Number.isFinite(value.vMax)
  ) {
    return null;
  }
  const rotation = Math.trunc(value.rotationQuarter);
  if (rotation < 0 || rotation > 3) return null;
  return {
    faceId: value.faceId,
    cubeId: value.cubeId,
    cubeName: value.cubeName,
    direction: value.direction,
    rotationQuarter: rotation as 0 | 1 | 2 | 3,
    uMin: value.uMin,
    vMin: value.vMin,
    uMax: value.uMax,
    vMax: value.vMax
  };
};

const asTextureUvEdge = (value: unknown): NativeTextureUvEdge | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.x1 !== 'number' ||
    !Number.isFinite(value.x1) ||
    typeof value.y1 !== 'number' ||
    !Number.isFinite(value.y1) ||
    typeof value.x2 !== 'number' ||
    !Number.isFinite(value.x2) ||
    typeof value.y2 !== 'number' ||
    !Number.isFinite(value.y2)
  ) {
    return null;
  }
  return {
    x1: value.x1,
    y1: value.y1,
    x2: value.x2,
    y2: value.y2
  };
};

const asTextureAtlas = (value: unknown): NativeTextureAtlas | null => {
  if (!isRecord(value)) return null;
  if (typeof value.textureId !== 'string' || typeof value.name !== 'string' || typeof value.imageDataUrl !== 'string') return null;
  if (
    typeof value.width !== 'number' ||
    !Number.isFinite(value.width) ||
    typeof value.height !== 'number' ||
    !Number.isFinite(value.height) ||
    typeof value.faceCount !== 'number' ||
    !Number.isFinite(value.faceCount)
  ) {
    return null;
  }
  const faces = Array.isArray(value.faces)
    ? value.faces
        .map((entry) => asTextureFaceRef(entry))
        .filter((entry): entry is NativeTextureAtlasFaceRef => Boolean(entry))
    : [];
  const uvEdges = Array.isArray(value.uvEdges)
    ? value.uvEdges
        .map((entry) => asTextureUvEdge(entry))
        .filter((entry): entry is NativeTextureUvEdge => Boolean(entry))
    : [];
  return {
    textureId: value.textureId,
    name: value.name,
    width: Math.trunc(value.width),
    height: Math.trunc(value.height),
    faceCount: Math.trunc(value.faceCount),
    imageDataUrl: value.imageDataUrl,
    faces,
    uvEdges
  };
};

const asAnimationEntry = (
  value: unknown
): {
  id: string;
  name: string;
  length: number;
  loop: boolean;
} | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (typeof value.length !== 'number' || !Number.isFinite(value.length)) return null;
  if (typeof value.loop !== 'boolean') return null;
  return {
    id: value.id,
    name: value.name,
    length: value.length,
    loop: value.loop
  };
};

export const asProjectLock = (value: unknown): NativeProjectLock | null => {
  if (!isRecord(value)) return null;
  if (typeof value.ownerAgentId !== 'string') return null;
  const ownerSessionId =
    value.ownerSessionId === null
      ? null
      : typeof value.ownerSessionId === 'string'
        ? value.ownerSessionId
        : null;
  if (typeof value.token !== 'string') return null;
  if (typeof value.acquiredAt !== 'string') return null;
  if (typeof value.heartbeatAt !== 'string') return null;
  if (typeof value.expiresAt !== 'string') return null;
  if (!isProjectLockMode(value.mode)) return null;
  return {
    ownerAgentId: value.ownerAgentId,
    ownerSessionId,
    token: value.token,
    acquiredAt: value.acquiredAt,
    heartbeatAt: value.heartbeatAt,
    expiresAt: value.expiresAt,
    mode: value.mode
  };
};

export const asProjectSnapshot = (value: unknown): NativeProjectSnapshot | null => {
  if (!isRecord(value)) return null;
  if (typeof value.projectId !== 'string' || typeof value.name !== 'string') return null;
  const parentFolderId =
    value.parentFolderId === null
      ? null
      : typeof value.parentFolderId === 'string'
        ? value.parentFolderId
        : null;
  if (typeof value.revision !== 'number' || !Number.isFinite(value.revision)) return null;
  if (typeof value.hasGeometry !== 'boolean') return null;
  if (!isRecord(value.stats)) return null;
  if (typeof value.stats.bones !== 'number' || !Number.isFinite(value.stats.bones)) return null;
  if (typeof value.stats.cubes !== 'number' || !Number.isFinite(value.stats.cubes)) return null;
  const hierarchy = Array.isArray(value.hierarchy)
    ? value.hierarchy
        .map((entry) => asHierarchyNode(entry))
        .filter((entry): entry is NativeHierarchyNode => Boolean(entry))
    : [];
  const animations = Array.isArray(value.animations)
    ? value.animations
        .map((entry) => asAnimationEntry(entry))
        .filter(
          (
            entry
          ): entry is {
            id: string;
            name: string;
            length: number;
            loop: boolean;
          } => Boolean(entry)
        )
    : [];
  const activeJob = isRecord(value.activeJob) && typeof value.activeJob.id === 'string' && isNativeJobStatus(value.activeJob.status)
    ? { id: value.activeJob.id, status: value.activeJob.status }
    : undefined;
  const projectLock = asProjectLock(value.projectLock);

  const project: NativeProjectSnapshot = {
    projectId: value.projectId,
    ...(typeof value.workspaceId === 'string' && value.workspaceId.trim().length > 0
      ? { workspaceId: value.workspaceId.trim() }
      : {}),
    name: value.name,
    parentFolderId,
    revision: Math.trunc(value.revision),
    hasGeometry: value.hasGeometry,
    ...(asFocusAnchor(value.focusAnchor) ? { focusAnchor: asFocusAnchor(value.focusAnchor) } : {}),
    hierarchy,
    animations,
    stats: {
      bones: Math.trunc(value.stats.bones),
      cubes: Math.trunc(value.stats.cubes)
    },
    textureSources: Array.isArray(value.textureSources)
      ? value.textureSources
          .map((entry) => asTextureFaceSource(entry))
          .filter((entry): entry is NativeTextureFaceSource => Boolean(entry))
      : [],
    textures: Array.isArray(value.textures)
      ? value.textures
          .map((entry) => asTextureAtlas(entry))
          .filter((entry): entry is NativeTextureAtlas => Boolean(entry))
      : [],
    ...(projectLock ? { projectLock } : {}),
    ...(activeJob ? { activeJob } : {})
  };
  synchronizeProjectSnapshot(project);
  return project;
};

export const asNativeJob = (value: unknown): NativeJob | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.projectId !== 'string' || typeof value.kind !== 'string') return null;
  if (!isSupportedNativeJobKind(value.kind)) return null;
  if (!isNativeJobStatus(value.status)) return null;
  if (typeof value.attemptCount !== 'number' || !Number.isFinite(value.attemptCount)) return null;
  if (typeof value.maxAttempts !== 'number' || !Number.isFinite(value.maxAttempts)) return null;
  if (typeof value.leaseMs !== 'number' || !Number.isFinite(value.leaseMs)) return null;
  if (typeof value.createdAt !== 'string') return null;

  const kind = value.kind;
  const baseJob = {
    id: value.id,
    projectId: value.projectId,
    status: value.status,
    attemptCount: Math.trunc(value.attemptCount),
    maxAttempts: Math.trunc(value.maxAttempts),
    leaseMs: Math.trunc(value.leaseMs),
    createdAt: value.createdAt,
    ...(typeof value.startedAt === 'string' ? { startedAt: value.startedAt } : {}),
    ...(typeof value.leaseExpiresAt === 'string' ? { leaseExpiresAt: value.leaseExpiresAt } : {}),
    ...(typeof value.nextRetryAt === 'string' ? { nextRetryAt: value.nextRetryAt } : {}),
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(typeof value.workerId === 'string' ? { workerId: value.workerId } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    ...(value.deadLetter === true ? { deadLetter: true } : {})
  };

  try {
    if (kind === 'gltf.convert') {
      const payload = normalizeNativeJobPayload('gltf.convert', value.payload);
      const result = normalizeNativeJobResult('gltf.convert', value.result);
      return {
        ...baseJob,
        kind: 'gltf.convert',
        ...(payload ? { payload } : {}),
        ...(result ? { result } : {})
      };
    }

    const payload = normalizeNativeJobPayload('texture.preflight', value.payload);
    const result = normalizeNativeJobResult('texture.preflight', value.result);
    return {
      ...baseJob,
      kind: 'texture.preflight',
      ...(payload ? { payload } : {}),
      ...(result ? { result } : {})
    };
  } catch {
    return null;
  }
};

export const asProjectEvent = (value: unknown): NativeProjectEvent | null => {
  if (!isRecord(value)) return null;
  if (typeof value.seq !== 'number' || !Number.isFinite(value.seq)) return null;
  if (value.event !== 'project_snapshot') return null;
  const data = asProjectSnapshot(value.data);
  if (!data) return null;
  return {
    seq: Math.trunc(value.seq),
    event: 'project_snapshot',
    data
  };
};

export const asLockState = (value: unknown): { owner: string; expiresAt: string } | null => {
  if (!isRecord(value)) return null;
  if (typeof value.owner !== 'string') return null;
  if (typeof value.expiresAt !== 'string') return null;
  return {
    owner: value.owner,
    expiresAt: value.expiresAt
  };
};
