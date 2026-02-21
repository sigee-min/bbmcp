import type {
  NativeHierarchyNode,
  NativeJob,
  NativeProjectEvent,
  NativeProjectFolder,
  NativeProjectSnapshot,
  NativeTextureAtlas,
  NativeTextureAtlasFaceRef,
  NativeTextureFaceSource,
  NativeTextureUvEdge,
  NativeTreeChildRef
} from './types';

export const cloneTreeChildRef = (entry: NativeTreeChildRef): NativeTreeChildRef => ({
  kind: entry.kind,
  id: entry.id
});

export const cloneFolder = (folder: NativeProjectFolder): NativeProjectFolder => ({
  folderId: folder.folderId,
  name: folder.name,
  parentFolderId: folder.parentFolderId,
  children: folder.children.map((entry) => cloneTreeChildRef(entry))
});

const cloneHierarchyNode = (node: NativeHierarchyNode): NativeHierarchyNode => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  children: node.children.map((child) => cloneHierarchyNode(child))
});

const cloneTextureFaceSource = (face: NativeTextureFaceSource): NativeTextureFaceSource => ({
  faceId: face.faceId,
  cubeId: face.cubeId,
  cubeName: face.cubeName,
  direction: face.direction,
  colorHex: face.colorHex,
  rotationQuarter: face.rotationQuarter
});

const cloneTextureFaceRef = (face: NativeTextureAtlasFaceRef): NativeTextureAtlasFaceRef => ({
  faceId: face.faceId,
  cubeId: face.cubeId,
  cubeName: face.cubeName,
  direction: face.direction,
  rotationQuarter: face.rotationQuarter,
  uMin: face.uMin,
  vMin: face.vMin,
  uMax: face.uMax,
  vMax: face.vMax
});

const cloneTextureUvEdge = (edge: NativeTextureUvEdge): NativeTextureUvEdge => ({
  x1: edge.x1,
  y1: edge.y1,
  x2: edge.x2,
  y2: edge.y2
});

const cloneTextureAtlas = (texture: NativeTextureAtlas): NativeTextureAtlas => ({
  textureId: texture.textureId,
  name: texture.name,
  width: texture.width,
  height: texture.height,
  faceCount: texture.faceCount,
  imageDataUrl: texture.imageDataUrl,
  faces: texture.faces.map((face) => cloneTextureFaceRef(face)),
  uvEdges: texture.uvEdges.map((edge) => cloneTextureUvEdge(edge))
});

export const cloneProject = (project: NativeProjectSnapshot): NativeProjectSnapshot => ({
  projectId: project.projectId,
  ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
  name: project.name,
  parentFolderId: project.parentFolderId,
  revision: project.revision,
  hasGeometry: project.hasGeometry,
  ...(project.focusAnchor ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] } : {}),
  hierarchy: project.hierarchy.map((node) => cloneHierarchyNode(node)),
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
  textureSources: project.textureSources.map((face) => cloneTextureFaceSource(face)),
  textures: project.textures.map((texture) => cloneTextureAtlas(texture)),
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
  ...(project.activeJob ? { activeJob: { id: project.activeJob.id, status: project.activeJob.status } } : {})
});

export const cloneJob = (job: NativeJob): NativeJob => ({
  id: job.id,
  projectId: job.projectId,
  status: job.status,
  attemptCount: job.attemptCount,
  maxAttempts: job.maxAttempts,
  leaseMs: job.leaseMs,
  createdAt: job.createdAt,
  ...(job.startedAt ? { startedAt: job.startedAt } : {}),
  ...(job.leaseExpiresAt ? { leaseExpiresAt: job.leaseExpiresAt } : {}),
  ...(job.nextRetryAt ? { nextRetryAt: job.nextRetryAt } : {}),
  ...(job.completedAt ? { completedAt: job.completedAt } : {}),
  ...(job.workerId ? { workerId: job.workerId } : {}),
  ...(job.error ? { error: job.error } : {}),
  ...(job.deadLetter ? { deadLetter: true } : {}),
  ...(job.kind === 'gltf.convert'
    ? {
        kind: 'gltf.convert',
        ...(job.payload ? { payload: { ...job.payload } } : {}),
        ...(job.result
          ? {
              result: {
                ...job.result,
                ...(job.result.diagnostics ? { diagnostics: [...job.result.diagnostics] } : {}),
                ...(job.result.output ? { output: { ...job.result.output } } : {}),
                ...(job.result.hierarchy
                  ? {
                      hierarchy: job.result.hierarchy.map((node) => cloneHierarchyNode(node as NativeHierarchyNode))
                    }
                  : {}),
                ...(job.result.animations
                  ? {
                      animations: job.result.animations.map((animation) => ({
                        id: animation.id,
                        name: animation.name,
                        length: animation.length,
                        loop: animation.loop
                      }))
                    }
                  : {}),
                ...(job.result.textureSources
                  ? {
                      textureSources: job.result.textureSources.map((source) => ({
                        faceId: source.faceId,
                        cubeId: source.cubeId,
                        cubeName: source.cubeName,
                        direction: source.direction,
                        colorHex: source.colorHex,
                        rotationQuarter: source.rotationQuarter
                      }))
                    }
                  : {}),
                ...(job.result.textures
                  ? {
                      textures: job.result.textures.map((texture) => ({
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
                    }
                  : {})
              }
            }
          : {})
      }
    : {
        kind: 'texture.preflight',
        ...(job.payload
          ? {
              payload: {
                ...job.payload,
                ...(job.payload.textureIds ? { textureIds: [...job.payload.textureIds] } : {})
              }
            }
          : {}),
        ...(job.result
          ? {
              result: {
                ...job.result,
                ...(job.result.diagnostics ? { diagnostics: [...job.result.diagnostics] } : {}),
                ...(job.result.output ? { output: { ...job.result.output } } : {}),
                ...(job.result.summary ? { summary: { ...job.result.summary } } : {})
              }
            }
          : {})
      })
});

export const cloneEvent = (event: NativeProjectEvent): NativeProjectEvent => ({
  seq: event.seq,
  event: event.event,
  data: cloneProject(event.data)
});
