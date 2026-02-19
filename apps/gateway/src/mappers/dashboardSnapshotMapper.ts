import type { NativeHierarchyNode, NativeProjectSnapshot } from '@ashfox/native-pipeline/types';

const mapHierarchyNode = (node: NativeHierarchyNode): NativeHierarchyNode => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  children: node.children.map((child) => mapHierarchyNode(child))
});

export const buildSnapshotPayload = (project: NativeProjectSnapshot, revision: number) => ({
  projectId: project.projectId,
  ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
  name: project.name,
  parentFolderId: project.parentFolderId,
  revision,
  hasGeometry: project.hasGeometry,
  ...(project.focusAnchor
    ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] }
    : {}),
  hierarchy: project.hierarchy.map((node) => mapHierarchyNode(node)),
  animations: project.animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: animation.length,
    loop: animation.loop
  })),
  stats: {
    bones: project.stats.bones,
    cubes: project.stats.cubes
  },
  activeJobStatus: project.activeJob?.status ?? null,
  ...(project.projectLock
    ? {
        projectLock: {
          ownerAgentId: project.projectLock.ownerAgentId,
          ownerSessionId: project.projectLock.ownerSessionId,
          token: project.projectLock.token,
          acquiredAt: project.projectLock.acquiredAt,
          heartbeatAt: project.projectLock.heartbeatAt,
          expiresAt: project.projectLock.expiresAt,
          mode: project.projectLock.mode
        }
      }
    : {}),
  textures: project.textures.map((texture) => ({
    textureId: texture.textureId,
    name: texture.name,
    width: texture.width,
    height: texture.height,
    faceCount: texture.faceCount,
    imageDataUrl: texture.imageDataUrl,
    faces: texture.faces.map((face) => ({
      faceId: face.faceId,
      cubeId: face.cubeId,
      cubeName: face.cubeName,
      direction: face.direction,
      rotationQuarter: face.rotationQuarter,
      uMin: face.uMin,
      vMin: face.vMin,
      uMax: face.uMax,
      vMax: face.vMax
    })),
    uvEdges: texture.uvEdges.map((edge) => ({
      x1: edge.x1,
      y1: edge.y1,
      x2: edge.x2,
      y2: edge.y2
    }))
  }))
});
