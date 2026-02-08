import type { SessionState } from '../../../session';
import type { BlockbenchGlobals, CubeInstance, GroupInstance, MeshInstance, OutlinerNode } from '../../../types/blockbench';
import { isRecord } from '../../../domain/guards';
import { readVisibility } from '../blockbenchUtils';
import { readNodeId } from './snapshotIds';

type Vec3Like = { x: number; y: number; z: number } | [number, number, number];

export const walkNodes = (
  nodes: OutlinerNode[],
  parent: string | undefined,
  bones: SessionState['bones'],
  cubes: SessionState['cubes'],
  meshes: SessionState['meshes'],
  globals: BlockbenchGlobals
) => {
  (nodes ?? []).forEach((node) => {
    if (isGroup(node, globals)) {
      const boneName = String(node.name ?? 'bone');
      bones.push({
        id: readNodeId(node),
        name: boneName,
        parent,
        pivot: toVec3(node.origin ?? node.pivot ?? [0, 0, 0]),
        rotation: toOptionalVec3(node.rotation),
        scale: toOptionalVec3(node.scale),
        visibility: readVisibility(node)
      });
      walkNodes(node.children ?? [], boneName, bones, cubes, meshes, globals);
      return;
    }
    if (isCube(node, globals)) {
      cubes.push({
        id: readNodeId(node),
        name: String(node.name ?? 'cube'),
        from: toVec3(node.from ?? [0, 0, 0]),
        to: toVec3(node.to ?? [0, 0, 0]),
        origin: toOptionalVec3(node.origin),
        rotation: toOptionalVec3(node.rotation),
        bone: parent ?? (node.parent?.name ?? 'root'),
        uv: toOptionalVec2(node.uv_offset ?? node.uv),
        uvOffset: toOptionalVec2(node.uv_offset),
        inflate: node.inflate,
        mirror: node.mirror_uv ?? node.mirror,
        visibility: readVisibility(node),
        boxUv: node.box_uv
      });
      return;
    }
    if (isMesh(node, globals)) {
      meshes?.push({
        id: readNodeId(node),
        name: String(node.name ?? 'mesh'),
        bone: parent ?? (node.parent?.name ?? undefined),
        origin: toOptionalVec3(node.origin),
        rotation: toOptionalVec3(node.rotation),
        visibility: readVisibility(node),
        vertices: toMeshVertices(node.vertices),
        faces: toMeshFaces(node.faces)
      });
    }
  });
};

const isGroup = (node: OutlinerNode | null | undefined, globals: BlockbenchGlobals): node is GroupInstance => {
  if (!node) return false;
  const groupCtor = globals.Group;
  if (groupCtor && node instanceof groupCtor) return true;
  if (!isRecord(node)) return false;
  const hasChildren = Array.isArray(node.children);
  const hasCubeVectors = isVec3Like(node.from) && isVec3Like(node.to);
  return hasChildren && !hasCubeVectors;
};

const isCube = (node: OutlinerNode | null | undefined, globals: BlockbenchGlobals): node is CubeInstance => {
  if (!node) return false;
  const cubeCtor = globals.Cube;
  if (cubeCtor && node instanceof cubeCtor) return true;
  if (!isRecord(node)) return false;
  return isVec3Like(node.from) && isVec3Like(node.to);
};

const isMesh = (node: OutlinerNode | null | undefined, globals: BlockbenchGlobals): node is MeshInstance => {
  if (!node) return false;
  const meshCtor = globals.Mesh;
  if (meshCtor && node instanceof meshCtor) return true;
  if (!isRecord(node)) return false;
  if (isVec3Like(node.from) && isVec3Like(node.to)) return false;
  return isRecord(node.vertices) && isRecord(node.faces);
};

const isVec3Like = (value: unknown): value is Vec3Like => {
  if (Array.isArray(value)) {
    return value.length >= 3 && typeof value[0] === 'number' && typeof value[1] === 'number' && typeof value[2] === 'number';
  }
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';
};

const toVec3 = (value: Vec3Like): [number, number, number] => {
  if (Array.isArray(value)) {
    return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
  }
  return [value?.x ?? 0, value?.y ?? 0, value?.z ?? 0];
};

const toOptionalVec3 = (value: Vec3Like | null | undefined): [number, number, number] | undefined => {
  if (!value) return undefined;
  return toVec3(value);
};

const toOptionalVec2 = (value: unknown): [number, number] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return [value[0] ?? 0, value[1] ?? 0];
  if (isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number') return [value.x, value.y];
  return undefined;
};

const toMeshVertices = (value: unknown): Array<{ id: string; pos: [number, number, number] }> => {
  if (!isRecord(value)) return [];
  const result: Array<{ id: string; pos: [number, number, number] }> = [];
  for (const [id, pos] of Object.entries(value)) {
    if (!Array.isArray(pos)) continue;
    result.push({ id, pos: [Number(pos[0] ?? 0), Number(pos[1] ?? 0), Number(pos[2] ?? 0)] });
  }
  return result;
};

const toMeshFaces = (
  value: unknown
): Array<{ id?: string; vertices: string[]; uv?: Array<{ vertexId: string; uv: [number, number] }>; texture?: string | false }> => {
  if (!isRecord(value)) return [];
  const result: Array<{
    id?: string;
    vertices: string[];
    uv?: Array<{ vertexId: string; uv: [number, number] }>;
    texture?: string | false;
  }> = [];
  for (const [id, face] of Object.entries(value)) {
    if (!isRecord(face) || !Array.isArray(face.vertices)) continue;
    const uvRecord = isRecord(face.uv) ? face.uv : undefined;
    const uv = uvRecord
      ? Object.entries(uvRecord)
          .filter((entry): entry is [string, [unknown, unknown]] => Array.isArray(entry[1]))
          .map(([vertexId, pair]) => ({
            vertexId,
            uv: [Number(pair[0] ?? 0), Number(pair[1] ?? 0)] as [number, number]
          }))
      : undefined;
    result.push({
      id,
      vertices: face.vertices.map((vertexId) => String(vertexId)),
      ...(uv && uv.length > 0 ? { uv } : {}),
      ...(typeof face.texture === 'string' || face.texture === false ? { texture: face.texture } : {})
    });
  }
  return result;
};

export const ensureRootBone = (bones: SessionState['bones'], cubes: SessionState['cubes']) => {
  const needsRoot = cubes.some((cube) => cube.bone === 'root');
  if (!needsRoot) return;
  const hasRoot = bones.some((bone) => bone.name === 'root');
  if (hasRoot) return;
  bones.unshift({ name: 'root', pivot: [0, 0, 0] });
};
