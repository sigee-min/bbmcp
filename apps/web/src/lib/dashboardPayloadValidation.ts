import type {
  ProjectLockSnapshot,
  ProjectStats,
  ProjectStreamPayload,
  ProjectTextureAtlas
} from './dashboardModel';

export const isProjectStreamPayload = (value: unknown): value is ProjectStreamPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProjectStreamPayload>;
  if (typeof candidate.projectId !== 'string') {
    return false;
  }
  if (typeof candidate.revision !== 'number' || Number.isNaN(candidate.revision)) {
    return false;
  }
  if (candidate.name !== undefined && typeof candidate.name !== 'string') {
    return false;
  }
  if (
    candidate.parentFolderId !== undefined &&
    candidate.parentFolderId !== null &&
    typeof candidate.parentFolderId !== 'string'
  ) {
    return false;
  }
  if (typeof candidate.hasGeometry !== 'boolean') {
    return false;
  }
  if (!Array.isArray(candidate.hierarchy) || !Array.isArray(candidate.animations)) {
    return false;
  }
  if (!candidate.stats || typeof candidate.stats !== 'object') {
    return false;
  }
  const stats = candidate.stats as Partial<ProjectStats>;
  if (typeof stats.bones !== 'number' || typeof stats.cubes !== 'number') {
    return false;
  }
  if (
    candidate.activeJobStatus !== undefined &&
    candidate.activeJobStatus !== null &&
    candidate.activeJobStatus !== 'queued' &&
    candidate.activeJobStatus !== 'running' &&
    candidate.activeJobStatus !== 'completed' &&
    candidate.activeJobStatus !== 'failed'
  ) {
    return false;
  }
  if (candidate.projectLock !== undefined) {
    if (!candidate.projectLock || typeof candidate.projectLock !== 'object') {
      return false;
    }
    const lock = candidate.projectLock as Partial<ProjectLockSnapshot>;
    if (
      typeof lock.ownerAgentId !== 'string' ||
      (lock.ownerSessionId !== null && lock.ownerSessionId !== undefined && typeof lock.ownerSessionId !== 'string') ||
      typeof lock.token !== 'string' ||
      typeof lock.acquiredAt !== 'string' ||
      typeof lock.heartbeatAt !== 'string' ||
      typeof lock.expiresAt !== 'string' ||
      lock.mode !== 'mcp'
    ) {
      return false;
    }
  }
  if (candidate.textures === undefined) {
    return true;
  }
  if (!Array.isArray(candidate.textures)) {
    return false;
  }
  return candidate.textures.every((texture) => {
    if (!texture || typeof texture !== 'object') {
      return false;
    }
    const candidateTexture = texture as Partial<ProjectTextureAtlas>;
    if (
      typeof candidateTexture.textureId !== 'string' ||
      typeof candidateTexture.name !== 'string' ||
      typeof candidateTexture.width !== 'number' ||
      typeof candidateTexture.height !== 'number' ||
      typeof candidateTexture.faceCount !== 'number' ||
      typeof candidateTexture.imageDataUrl !== 'string'
    ) {
      return false;
    }
    if (!Array.isArray(candidateTexture.faces) || !Array.isArray(candidateTexture.uvEdges)) {
      return false;
    }
    return true;
  });
};
