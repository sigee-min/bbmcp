import type { TextureResolution, TextureStat, TextureUsageResult } from '../ports/editor';
import type { SessionState, TrackedAnimation, TrackedBone, TrackedCube, TrackedMesh } from '../session';
import type {
  Animation,
  Bone,
  Cube,
  Mesh,
  MeshFace,
  MeshFaceUv,
  MeshVertex,
  Snapshot,
  TextureResolution as DomainTextureResolution,
  TextureStat as DomainTextureStat,
  TextureUsage,
  TextureUsageCube,
  TextureUsageEntry,
  TextureUsageFace,
  TextureUsageUnresolved
} from '../domain/model';

export const toDomainTextureUsage = (usage: TextureUsageResult): TextureUsage => ({
  textures: usage.textures.map((entry) => toDomainTextureUsageEntry(entry)),
  unresolved: usage.unresolved ? usage.unresolved.map((entry) => toDomainTextureUsageUnresolved(entry)) : undefined
});

export const toDomainTextureUsageEntry = (entry: TextureUsageResult['textures'][number]): TextureUsageEntry => ({
  id: entry.id ?? undefined,
  name: entry.name,
  width: entry.width ?? undefined,
  height: entry.height ?? undefined,
  cubeCount: entry.cubeCount,
  faceCount: entry.faceCount,
  cubes: entry.cubes.map((cube) => toDomainTextureUsageCube(cube))
});

export const toDomainTextureUsageCube = (
  cube: TextureUsageResult['textures'][number]['cubes'][number]
): TextureUsageCube => ({
  id: cube.id ?? undefined,
  name: cube.name,
  faces: cube.faces.map((face) => toDomainTextureUsageFace(face))
});

export const toDomainTextureUsageFace = (
  face: TextureUsageResult['textures'][number]['cubes'][number]['faces'][number]
): TextureUsageFace => ({
  face: face.face,
  uv: face.uv ? [face.uv[0], face.uv[1], face.uv[2], face.uv[3]] : undefined
});

export const toDomainTextureUsageUnresolved = (
  entry: NonNullable<TextureUsageResult['unresolved']>[number]
): TextureUsageUnresolved => ({
  textureRef: entry.textureRef,
  cubeId: entry.cubeId ?? undefined,
  cubeName: entry.cubeName,
  face: entry.face
});

export const toDomainSnapshot = (state: SessionState): Snapshot => ({
  bones: state.bones.map((bone) => toDomainBone(bone)),
  cubes: state.cubes.map((cube) => toDomainCube(cube)),
  meshes: (state.meshes ?? []).map((mesh) => toDomainMesh(mesh)),
  animations: state.animations.map((anim) => toDomainAnimation(anim))
});

export const toDomainCube = (cube: TrackedCube): Cube => ({
  id: cube.id ?? undefined,
  name: cube.name,
  from: [cube.from[0], cube.from[1], cube.from[2]],
  to: [cube.to[0], cube.to[1], cube.to[2]],
  bone: cube.bone,
  origin: cube.origin ? [cube.origin[0], cube.origin[1], cube.origin[2]] : undefined,
  rotation: cube.rotation ? [cube.rotation[0], cube.rotation[1], cube.rotation[2]] : undefined,
  uv: cube.uv ? [cube.uv[0], cube.uv[1]] : undefined,
  uvOffset: cube.uvOffset ? [cube.uvOffset[0], cube.uvOffset[1]] : undefined,
  inflate: cube.inflate,
  mirror: cube.mirror,
  visibility: cube.visibility,
  boxUv: cube.boxUv
});

export const toDomainBone = (bone: TrackedBone): Bone => ({
  id: bone.id ?? undefined,
  name: bone.name,
  parent: bone.parent,
  pivot: [bone.pivot[0], bone.pivot[1], bone.pivot[2]],
  rotation: bone.rotation ? [bone.rotation[0], bone.rotation[1], bone.rotation[2]] : undefined,
  scale: bone.scale ? [bone.scale[0], bone.scale[1], bone.scale[2]] : undefined,
  visibility: bone.visibility
});

export const toDomainAnimation = (anim: TrackedAnimation): Animation => ({
  id: anim.id ?? undefined,
  name: anim.name,
  length: anim.length,
  loop: anim.loop,
  fps: anim.fps
});

export const toDomainMesh = (mesh: TrackedMesh): Mesh => ({
  id: mesh.id ?? undefined,
  name: mesh.name,
  bone: mesh.bone ?? undefined,
  origin: mesh.origin ? [mesh.origin[0], mesh.origin[1], mesh.origin[2]] : undefined,
  rotation: mesh.rotation ? [mesh.rotation[0], mesh.rotation[1], mesh.rotation[2]] : undefined,
  visibility: mesh.visibility,
  vertices: mesh.vertices.map((vertex) => toDomainMeshVertex(vertex)),
  faces: mesh.faces.map((face) => toDomainMeshFace(face))
});

export const toDomainMeshVertex = (vertex: TrackedMesh['vertices'][number]): MeshVertex => ({
  id: vertex.id,
  pos: [vertex.pos[0], vertex.pos[1], vertex.pos[2]]
});

export const toDomainMeshFace = (face: TrackedMesh['faces'][number]): MeshFace => ({
  id: face.id ?? undefined,
  vertices: [...face.vertices],
  uv: face.uv?.map((point) => toDomainMeshFaceUv(point)),
  texture: face.texture
});

export const toDomainMeshFaceUv = (point: NonNullable<TrackedMesh['faces'][number]['uv']>[number]): MeshFaceUv => ({
  vertexId: point.vertexId,
  uv: [point.uv[0], point.uv[1]]
});

export const toDomainTextureStats = (stats: TextureStat[]): DomainTextureStat[] =>
  stats.map((tex) => ({
    id: tex.id ?? undefined,
    name: tex.name,
    width: tex.width,
    height: tex.height,
    path: tex.path
  }));

export const toDomainTextureResolution = (
  resolution: TextureResolution | null | undefined
): DomainTextureResolution | undefined => {
  if (!resolution) return undefined;
  return { width: resolution.width, height: resolution.height };
};


