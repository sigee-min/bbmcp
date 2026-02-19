export * from './nativeJobContracts';

import type { NativeJobPayloadMap, NativeJobResultMap, NativeJobStatus, SupportedNativeJobKind } from './nativeJobContracts';

export const MAX_FOLDER_DEPTH = 3;

export type NativeTreeChildRef = {
  kind: 'folder' | 'project';
  id: string;
};

export interface NativeProjectFolder {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  children: NativeTreeChildRef[];
}

export interface NativeHierarchyNode {
  id: string;
  name: string;
  kind: 'bone' | 'cube';
  children: NativeHierarchyNode[];
}

export type NativeTextureFaceDirection = 'north' | 'east' | 'south' | 'west' | 'up' | 'down';

export interface NativeTextureFaceSource {
  faceId: string;
  cubeId: string;
  cubeName: string;
  direction: NativeTextureFaceDirection;
  colorHex: string;
  rotationQuarter: 0 | 1 | 2 | 3;
}

export interface NativeTextureAtlasFaceRef {
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

export interface NativeTextureUvEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NativeTextureAtlas {
  textureId: string;
  name: string;
  width: number;
  height: number;
  faceCount: number;
  imageDataUrl: string;
  faces: NativeTextureAtlasFaceRef[];
  uvEdges: NativeTextureUvEdge[];
}

export type NativeProjectLockMode = 'mcp';

export interface NativeProjectLock {
  ownerAgentId: string;
  ownerSessionId: string | null;
  token: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  mode: NativeProjectLockMode;
}

export type NativeProjectLockState = 'unlocked' | 'locked-by-self' | 'locked-by-other';

export interface NativeAcquireProjectLockInput {
  workspaceId?: string;
  projectId: string;
  ownerAgentId: string;
  ownerSessionId?: string | null;
  ttlMs?: number;
}

export interface NativeRenewProjectLockInput {
  workspaceId?: string;
  projectId: string;
  ownerAgentId: string;
  ownerSessionId?: string | null;
  ttlMs?: number;
}

export interface NativeReleaseProjectLockInput {
  workspaceId?: string;
  projectId: string;
  ownerAgentId: string;
  ownerSessionId?: string | null;
}

export interface NativeProjectSnapshot {
  projectId: string;
  workspaceId?: string;
  name: string;
  parentFolderId: string | null;
  revision: number;
  hasGeometry: boolean;
  focusAnchor?: readonly [number, number, number];
  hierarchy: NativeHierarchyNode[];
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
  textureSources: NativeTextureFaceSource[];
  textures: NativeTextureAtlas[];
  projectLock?: NativeProjectLock;
  activeJob?: {
    id: string;
    status: NativeJobStatus;
  };
}

export interface NativeProjectTreeFolderNode {
  kind: 'folder';
  folderId: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
  children: NativeProjectTreeNode[];
}

export interface NativeProjectTreeProjectNode {
  kind: 'project';
  projectId: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
  activeJobStatus: NativeJobStatus | null;
  lockState: NativeProjectLockState;
  lockedBySelf: boolean;
  lockOwnerAgentId: string | null;
}

export type NativeProjectTreeNode = NativeProjectTreeFolderNode | NativeProjectTreeProjectNode;

export interface NativeProjectTreeSnapshot {
  maxFolderDepth: number;
  roots: NativeProjectTreeNode[];
}

export interface NativeCreateFolderInput {
  workspaceId?: string;
  name: string;
  parentFolderId?: string | null;
  index?: number;
}

export interface NativeMoveFolderInput {
  workspaceId?: string;
  folderId: string;
  parentFolderId?: string | null;
  index?: number;
}

export interface NativeCreateProjectInput {
  workspaceId?: string;
  name: string;
  parentFolderId?: string | null;
  index?: number;
}

export interface NativeMoveProjectInput {
  workspaceId?: string;
  projectId: string;
  parentFolderId?: string | null;
  index?: number;
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
  workspaceId?: string;
  projectId: string;
  maxAttempts?: number;
  leaseMs?: number;
} & {
  [TKind in SupportedNativeJobKind]: {
    kind: TKind;
    payload?: NativeJobPayloadMap[TKind];
  }
}[SupportedNativeJobKind];
