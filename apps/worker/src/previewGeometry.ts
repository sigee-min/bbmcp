import type { ToolResultMap } from '@ashfox/contracts/types/internal';
import type { NativeHierarchyNode, NativeProjectSnapshot } from '@ashfox/native-pipeline/types';

export type PreviewBoneSeed = {
  name: string;
  parent?: string;
  pivot?: [number, number, number];
};

export type PreviewCubeSeed = {
  name: string;
  bone: string;
  from: [number, number, number];
  to: [number, number, number];
  uvOffset?: [number, number];
  mirror?: boolean;
};

export type PreviewGeometrySeed = {
  bones: PreviewBoneSeed[];
  cubes: PreviewCubeSeed[];
};

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
};

const normalizeProjectName = (value: string): string => value.trim().toLowerCase();

const FOREST_FOX_PREVIEW_SEED: PreviewGeometrySeed = {
  bones: [
    { name: 'root', pivot: [0, 0, 0] },
    { name: 'body', parent: 'root', pivot: [0, 10, 0] },
    { name: 'neck', parent: 'body', pivot: [6, 11, 0] },
    { name: 'head', parent: 'neck', pivot: [9, 12, 0] },
    { name: 'ear_left', parent: 'head', pivot: [10, 16, -2] },
    { name: 'ear_right', parent: 'head', pivot: [10, 16, 2] },
    { name: 'tail_base', parent: 'body', pivot: [-6, 11, 0] },
    { name: 'tail_tip', parent: 'tail_base', pivot: [-11, 13, 0] }
  ],
  cubes: [
    { name: 'torso', bone: 'body', from: [-6, 8, -3], to: [6, 13, 3], uvOffset: [0, 0] },
    { name: 'chest', bone: 'body', from: [2, 8, -2.5], to: [7, 12, 2.5], uvOffset: [22, 0] },
    { name: 'hip', bone: 'body', from: [-7, 8, -2.5], to: [-4, 12, 2.5], uvOffset: [34, 0] },
    { name: 'shoulder', bone: 'body', from: [4, 11, -2], to: [6, 13, 2], uvOffset: [40, 0] },
    { name: 'neck_main', bone: 'neck', from: [6, 11, -2], to: [9, 14, 2], uvOffset: [0, 14] },
    { name: 'head_main', bone: 'head', from: [8, 11, -2.5], to: [13, 15, 2.5], uvOffset: [12, 14] },
    { name: 'muzzle', bone: 'head', from: [12, 10.8, -1.7], to: [15, 13, 1.7], uvOffset: [30, 14] },
    { name: 'nose', bone: 'head', from: [14.5, 11.3, -0.8], to: [15.5, 12.1, 0.8], uvOffset: [40, 14] },
    { name: 'ear_left_geo', bone: 'ear_left', from: [9.6, 15, -2.8], to: [11.2, 17.4, -1.2], uvOffset: [0, 24] },
    { name: 'ear_right_geo', bone: 'ear_right', from: [9.6, 15, 1.2], to: [11.2, 17.4, 2.8], uvOffset: [6, 24], mirror: true },
    { name: 'leg_front_left_upper', bone: 'body', from: [3.5, 4.8, -2.2], to: [5.2, 8.2, -0.6], uvOffset: [14, 24] },
    { name: 'leg_front_left_lower', bone: 'body', from: [3.6, 1.2, -2.1], to: [5.1, 4.8, -0.7], uvOffset: [20, 24] },
    { name: 'leg_front_right_upper', bone: 'body', from: [3.5, 4.8, 0.6], to: [5.2, 8.2, 2.2], uvOffset: [26, 24], mirror: true },
    { name: 'leg_front_right_lower', bone: 'body', from: [3.6, 1.2, 0.7], to: [5.1, 4.8, 2.1], uvOffset: [32, 24], mirror: true },
    { name: 'leg_back_left_upper', bone: 'body', from: [-5.2, 4.8, -2.2], to: [-3.6, 8.2, -0.6], uvOffset: [38, 24] },
    { name: 'leg_back_left_lower', bone: 'body', from: [-5.1, 1.2, -2.1], to: [-3.7, 4.8, -0.7], uvOffset: [44, 24] },
    { name: 'leg_back_right_upper', bone: 'body', from: [-5.2, 4.8, 0.6], to: [-3.6, 8.2, 2.2], uvOffset: [50, 24], mirror: true },
    { name: 'leg_back_right_lower', bone: 'body', from: [-5.1, 1.2, 0.7], to: [-3.7, 4.8, 2.1], uvOffset: [56, 24], mirror: true },
    { name: 'tail_base_geo', bone: 'tail_base', from: [-9, 10, -1.4], to: [-5.8, 12.4, 1.4], uvOffset: [0, 34] },
    { name: 'tail_mid', bone: 'tail_base', from: [-11.8, 10.8, -1.2], to: [-8.9, 12.6, 1.2], uvOffset: [10, 34] },
    { name: 'tail_tip_geo', bone: 'tail_tip', from: [-15, 11.1, -1.1], to: [-11.7, 12.7, 1.1], uvOffset: [20, 34] }
  ]
};

const DESERT_LYNX_PREVIEW_SEED: PreviewGeometrySeed = {
  bones: [
    { name: 'root', pivot: [0, 0, 0] },
    { name: 'torso', parent: 'root', pivot: [0, 10, 0] },
    { name: 'head', parent: 'torso', pivot: [6, 12, 0] },
    { name: 'ear_left', parent: 'head', pivot: [8, 16, -1.6] },
    { name: 'ear_right', parent: 'head', pivot: [8, 16, 1.6] }
  ],
  cubes: [
    { name: 'torso_main', bone: 'torso', from: [-5.8, 8, -2.8], to: [5.2, 12.6, 2.8], uvOffset: [0, 0] },
    { name: 'torso_chest', bone: 'torso', from: [2.2, 8, -2.2], to: [6.8, 11.8, 2.2], uvOffset: [18, 0] },
    { name: 'torso_hip', bone: 'torso', from: [-7.2, 8.2, -2.1], to: [-4.6, 11.8, 2.1], uvOffset: [30, 0] },
    { name: 'head_main', bone: 'head', from: [6.8, 11, -2.2], to: [11.3, 14.8, 2.2], uvOffset: [0, 12] },
    { name: 'muzzle', bone: 'head', from: [10.8, 10.8, -1.2], to: [13.2, 12.8, 1.2], uvOffset: [12, 12] },
    { name: 'ear_left_geo', bone: 'ear_left', from: [7.2, 14.8, -2.2], to: [8.6, 17.2, -1], uvOffset: [22, 12] },
    { name: 'ear_right_geo', bone: 'ear_right', from: [7.2, 14.8, 1], to: [8.6, 17.2, 2.2], uvOffset: [28, 12], mirror: true },
    { name: 'leg_front_left', bone: 'torso', from: [2.8, 2.1, -2], to: [4.4, 8, -0.7], uvOffset: [34, 12] },
    { name: 'leg_front_right', bone: 'torso', from: [2.8, 2.1, 0.7], to: [4.4, 8, 2], uvOffset: [40, 12], mirror: true },
    { name: 'leg_back_left', bone: 'torso', from: [-4.8, 2.1, -2], to: [-3.2, 8, -0.7], uvOffset: [46, 12] },
    { name: 'leg_back_right', bone: 'torso', from: [-4.8, 2.1, 0.7], to: [-3.2, 8, 2], uvOffset: [52, 12], mirror: true },
    { name: 'tail', bone: 'torso', from: [-9.2, 9.6, -0.9], to: [-5.6, 11, 0.9], uvOffset: [0, 22] },
    { name: 'tail_tip', bone: 'torso', from: [-12.1, 10.1, -0.7], to: [-9.2, 11.1, 0.7], uvOffset: [10, 22] }
  ]
};

const flattenHierarchyBoneNames = (nodes: NativeProjectSnapshot['hierarchy']): string[] => {
  const collected: string[] = [];
  const walk = (entries: NativeProjectSnapshot['hierarchy']) => {
    for (const node of entries) {
      if (node.kind === 'bone') {
        collected.push(node.name);
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return collected;
};

export const buildHierarchyFromProjectState = (
  projectState: ToolResultMap['get_project_state']['project']
): NativeHierarchyNode[] => {
  const boneEntries = Array.isArray(projectState.bones) ? projectState.bones : [];
  const cubeEntries = Array.isArray(projectState.cubes) ? projectState.cubes : [];

  const boneNodeByName = new Map<string, NativeHierarchyNode>();
  for (const bone of boneEntries) {
    const boneName = typeof bone.name === 'string' ? bone.name.trim() : '';
    if (!boneName || boneNodeByName.has(boneName)) {
      continue;
    }
    boneNodeByName.set(boneName, {
      id: typeof bone.id === 'string' && bone.id.trim().length > 0 ? bone.id : `bone:${boneName}`,
      name: boneName,
      kind: 'bone',
      children: []
    });
  }

  const roots: NativeHierarchyNode[] = [];
  for (const bone of boneEntries) {
    const boneName = typeof bone.name === 'string' ? bone.name.trim() : '';
    if (!boneName) {
      continue;
    }
    const node = boneNodeByName.get(boneName);
    if (!node) {
      continue;
    }
    const parentName = typeof bone.parent === 'string' ? bone.parent.trim() : '';
    const parentNode = parentName ? boneNodeByName.get(parentName) : undefined;
    if (parentNode && parentNode !== node) {
      parentNode.children.push(node);
      continue;
    }
    roots.push(node);
  }

  cubeEntries.forEach((cube, index) => {
    const cubeName = typeof cube.name === 'string' && cube.name.trim().length > 0 ? cube.name.trim() : `cube_${index + 1}`;
    const cubeBone = typeof cube.bone === 'string' ? cube.bone.trim() : '';
    const cubeNode: NativeHierarchyNode = {
      id: typeof cube.id === 'string' && cube.id.trim().length > 0 ? cube.id : `cube:${cubeBone || 'root'}:${cubeName}:${index}`,
      name: cubeName,
      kind: 'cube',
      children: []
    };
    const parentBoneNode = cubeBone ? boneNodeByName.get(cubeBone) : undefined;
    if (parentBoneNode) {
      parentBoneNode.children.push(cubeNode);
      return;
    }
    roots.push(cubeNode);
  });

  return roots;
};

const buildGeneratedPreviewSeed = (project: NativeProjectSnapshot): PreviewGeometrySeed => {
  const requestedBones = Math.max(1, toNonNegativeInteger(project.stats.bones, 1));
  const requestedCubes = Math.max(1, Math.min(32, toNonNegativeInteger(project.stats.cubes, 1)));
  const hierarchyBones = flattenHierarchyBoneNames(project.hierarchy);
  const boneNames = hierarchyBones.length > 0 ? hierarchyBones : ['root'];
  while (boneNames.length < requestedBones) {
    boneNames.push(`aux_${boneNames.length}`);
  }

  const bones: PreviewBoneSeed[] = boneNames.map((name, index) => ({
    name,
    ...(index > 0 ? { parent: boneNames[index - 1] } : {}),
    pivot: [index * 1.2, 8 + index * 0.5, 0]
  }));

  const cubes: PreviewCubeSeed[] = [];
  for (let index = 0; index < requestedCubes; index += 1) {
    const lane = index % 4;
    const row = Math.floor(index / 4);
    const bone = boneNames[Math.min(row, boneNames.length - 1)] ?? boneNames[0] ?? 'root';
    const width = 1.2 + (lane % 2) * 0.5;
    const height = 1.4 + (row % 3) * 0.4;
    const depth = 1 + ((lane + row) % 2) * 0.4;
    const x = -5 + lane * 3;
    const y = 2 + row * 1.4;
    const z = lane < 2 ? -1.8 : 0.4;
    cubes.push({
      name: `cube_${index + 1}`,
      bone,
      from: [x, y, z],
      to: [x + width, y + height, z + depth],
      uvOffset: [(index * 4) % 56, (Math.floor(index / 8) * 8) % 48]
    });
  }

  return { bones, cubes };
};

export const selectPreviewSeed = (project: NativeProjectSnapshot): PreviewGeometrySeed => {
  const normalizedName = normalizeProjectName(project.name);
  if (normalizedName === 'forest fox') {
    return FOREST_FOX_PREVIEW_SEED;
  }
  if (normalizedName === 'desert lynx') {
    return DESERT_LYNX_PREVIEW_SEED;
  }
  return buildGeneratedPreviewSeed(project);
};

export const toRevision = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { revision?: unknown };
  return typeof candidate.revision === 'string' ? candidate.revision : null;
};
