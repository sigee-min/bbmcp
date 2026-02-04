import type { SessionState } from '../../../session';
import type { BlockbenchGlobals, CubeInstance, GroupInstance, OutlinerNode } from '../../../types/blockbench';
import { isRecord } from '../../../domain/guards';
import { readVisibility } from '../blockbenchUtils';
import { readNodeId } from './snapshotIds';

type Vec3Like = { x: number; y: number; z: number } | [number, number, number];

export const walkNodes = (
  nodes: OutlinerNode[],
  parent: string | undefined,
  bones: SessionState['bones'],
  cubes: SessionState['cubes'],
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
      walkNodes(node.children ?? [], boneName, bones, cubes, globals);
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
    }
  });
};

const isGroup = (node: OutlinerNode | null | undefined, globals: BlockbenchGlobals): node is GroupInstance => {
  if (!node) return false;
  const groupCtor = globals.Group;
  if (groupCtor && node instanceof groupCtor) return true;
  return Array.isArray(node.children);
};

const isCube = (node: OutlinerNode | null | undefined, globals: BlockbenchGlobals): node is CubeInstance => {
  if (!node) return false;
  const cubeCtor = globals.Cube;
  if (cubeCtor && node instanceof cubeCtor) return true;
  return node.from !== undefined && node.to !== undefined;
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

export const ensureRootBone = (bones: SessionState['bones'], cubes: SessionState['cubes']) => {
  const needsRoot = cubes.some((cube) => cube.bone === 'root');
  if (!needsRoot) return;
  const hasRoot = bones.some((bone) => bone.name === 'root');
  if (hasRoot) return;
  bones.unshift({ name: 'root', pivot: [0, 0, 0] });
};
