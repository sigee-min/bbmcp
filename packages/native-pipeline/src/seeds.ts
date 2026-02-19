import { createHash } from 'node:crypto';

import type { NativeHierarchyNode, NativeProjectFolder, NativeProjectSnapshot, NativeTreeChildRef } from './types';

const PROJECT_ID_PREFIX = 'prj';
const FOLDER_ID_PREFIX = 'fld';

const toSeedId = (prefix: string, name: string): string => {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const digest = createHash('sha256').update(`seed:${prefix}:${normalized}`).digest('hex').slice(0, 12);
  return `${prefix}_${digest}`;
};

const SAMPLES_FOLDER_ID = toSeedId(FOLDER_ID_PREFIX, 'Samples');
const TEMPLATES_FOLDER_ID = toSeedId(FOLDER_ID_PREFIX, 'Templates');
const FOREST_FOX_PROJECT_ID = toSeedId(PROJECT_ID_PREFIX, 'Forest Fox');
const DESERT_LYNX_PROJECT_ID = toSeedId(PROJECT_ID_PREFIX, 'Desert Lynx');
const EMPTY_TEMPLATE_PROJECT_ID = toSeedId(PROJECT_ID_PREFIX, 'Empty Template');

const seedFolders: NativeProjectFolder[] = [
  {
    folderId: SAMPLES_FOLDER_ID,
    name: 'Samples',
    parentFolderId: null,
    children: [
      { kind: 'project', id: FOREST_FOX_PROJECT_ID },
      { kind: 'project', id: DESERT_LYNX_PROJECT_ID },
      { kind: 'folder', id: TEMPLATES_FOLDER_ID }
    ]
  },
  {
    folderId: TEMPLATES_FOLDER_ID,
    name: 'Templates',
    parentFolderId: SAMPLES_FOLDER_ID,
    children: [{ kind: 'project', id: EMPTY_TEMPLATE_PROJECT_ID }]
  }
];

const seedRootChildren: NativeTreeChildRef[] = [{ kind: 'folder', id: SAMPLES_FOLDER_ID }];

type SeedBoneDef = {
  id: string;
  name: string;
  parent?: string;
};

type SeedCubeDef = {
  id: string;
  name: string;
  bone: string;
};

const buildSeedHierarchy = (
  bones: readonly SeedBoneDef[],
  cubes: readonly SeedCubeDef[]
): NativeHierarchyNode[] => {
  const byBoneName = new Map<string, NativeHierarchyNode>();
  for (const bone of bones) {
    byBoneName.set(bone.name, {
      id: bone.id,
      name: bone.name,
      kind: 'bone',
      children: []
    });
  }

  const roots: NativeHierarchyNode[] = [];
  for (const bone of bones) {
    const node = byBoneName.get(bone.name);
    if (!node) {
      continue;
    }
    const parent = bone.parent ? byBoneName.get(bone.parent) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const cube of cubes) {
    const cubeNode: NativeHierarchyNode = {
      id: cube.id,
      name: cube.name,
      kind: 'cube',
      children: []
    };
    const parent = byBoneName.get(cube.bone);
    if (parent) {
      parent.children.push(cubeNode);
    } else {
      roots.push(cubeNode);
    }
  }

  return roots;
};

const FOREST_FOX_SEED_BONES: readonly SeedBoneDef[] = [
  { id: 'bone-root', name: 'root' },
  { id: 'bone-body', name: 'body', parent: 'root' },
  { id: 'bone-neck', name: 'neck', parent: 'body' },
  { id: 'bone-head', name: 'head', parent: 'neck' },
  { id: 'bone-ear-left', name: 'ear_left', parent: 'head' },
  { id: 'bone-ear-right', name: 'ear_right', parent: 'head' },
  { id: 'bone-tail-base', name: 'tail_base', parent: 'body' },
  { id: 'bone-tail-tip', name: 'tail_tip', parent: 'tail_base' }
];

const FOREST_FOX_SEED_CUBES: readonly SeedCubeDef[] = [
  { id: 'cube-torso', name: 'torso', bone: 'body' },
  { id: 'cube-chest', name: 'chest', bone: 'body' },
  { id: 'cube-hip', name: 'hip', bone: 'body' },
  { id: 'cube-shoulder', name: 'shoulder', bone: 'body' },
  { id: 'cube-neck-main', name: 'neck_main', bone: 'neck' },
  { id: 'cube-head-main', name: 'head_main', bone: 'head' },
  { id: 'cube-muzzle', name: 'muzzle', bone: 'head' },
  { id: 'cube-nose', name: 'nose', bone: 'head' },
  { id: 'cube-ear-left', name: 'ear_left_geo', bone: 'ear_left' },
  { id: 'cube-ear-right', name: 'ear_right_geo', bone: 'ear_right' },
  { id: 'cube-leg-front-left-upper', name: 'leg_front_left_upper', bone: 'body' },
  { id: 'cube-leg-front-left-lower', name: 'leg_front_left_lower', bone: 'body' },
  { id: 'cube-leg-front-right-upper', name: 'leg_front_right_upper', bone: 'body' },
  { id: 'cube-leg-front-right-lower', name: 'leg_front_right_lower', bone: 'body' },
  { id: 'cube-leg-back-left-upper', name: 'leg_back_left_upper', bone: 'body' },
  { id: 'cube-leg-back-left-lower', name: 'leg_back_left_lower', bone: 'body' },
  { id: 'cube-leg-back-right-upper', name: 'leg_back_right_upper', bone: 'body' },
  { id: 'cube-leg-back-right-lower', name: 'leg_back_right_lower', bone: 'body' },
  { id: 'cube-tail-base', name: 'tail_base_geo', bone: 'tail_base' },
  { id: 'cube-tail-mid', name: 'tail_mid', bone: 'tail_base' },
  { id: 'cube-tail-tip', name: 'tail_tip_geo', bone: 'tail_tip' }
];

const DESERT_LYNX_SEED_BONES: readonly SeedBoneDef[] = [
  { id: 'bone-root', name: 'root' },
  { id: 'bone-torso', name: 'torso', parent: 'root' },
  { id: 'bone-head', name: 'head', parent: 'torso' },
  { id: 'bone-ear-left', name: 'ear_left', parent: 'head' },
  { id: 'bone-ear-right', name: 'ear_right', parent: 'head' }
];

const DESERT_LYNX_SEED_CUBES: readonly SeedCubeDef[] = [
  { id: 'cube-torso-main', name: 'torso_main', bone: 'torso' },
  { id: 'cube-torso-chest', name: 'torso_chest', bone: 'torso' },
  { id: 'cube-torso-hip', name: 'torso_hip', bone: 'torso' },
  { id: 'cube-head-main', name: 'head_main', bone: 'head' },
  { id: 'cube-muzzle', name: 'muzzle', bone: 'head' },
  { id: 'cube-ear-left', name: 'ear_left_geo', bone: 'ear_left' },
  { id: 'cube-ear-right', name: 'ear_right_geo', bone: 'ear_right' },
  { id: 'cube-leg-front-left', name: 'leg_front_left', bone: 'torso' },
  { id: 'cube-leg-front-right', name: 'leg_front_right', bone: 'torso' },
  { id: 'cube-leg-back-left', name: 'leg_back_left', bone: 'torso' },
  { id: 'cube-leg-back-right', name: 'leg_back_right', bone: 'torso' },
  { id: 'cube-tail', name: 'tail', bone: 'torso' },
  { id: 'cube-tail-tip', name: 'tail_tip', bone: 'torso' }
];

const seedProjects: NativeProjectSnapshot[] = [
  {
    projectId: FOREST_FOX_PROJECT_ID,
    name: 'Forest Fox',
    parentFolderId: SAMPLES_FOLDER_ID,
    revision: 10,
    hasGeometry: true,
    focusAnchor: [0, 24, 0],
    hierarchy: buildSeedHierarchy(FOREST_FOX_SEED_BONES, FOREST_FOX_SEED_CUBES),
    animations: [
      {
        id: 'anim-idle',
        name: 'idle',
        length: 2.4,
        loop: true
      }
    ],
    stats: {
      bones: 8,
      cubes: 21
    },
    textureSources: [],
    textures: []
  },
  {
    projectId: DESERT_LYNX_PROJECT_ID,
    name: 'Desert Lynx',
    parentFolderId: SAMPLES_FOLDER_ID,
    revision: 21,
    hasGeometry: true,
    focusAnchor: [1, 18, 0],
    hierarchy: buildSeedHierarchy(DESERT_LYNX_SEED_BONES, DESERT_LYNX_SEED_CUBES),
    animations: [
      {
        id: 'anim-breathe',
        name: 'breathe',
        length: 3.2,
        loop: true
      }
    ],
    stats: {
      bones: 5,
      cubes: 13
    },
    textureSources: [],
    textures: []
  },
  {
    projectId: EMPTY_TEMPLATE_PROJECT_ID,
    name: 'Empty Template',
    parentFolderId: TEMPLATES_FOLDER_ID,
    revision: 3,
    hasGeometry: false,
    hierarchy: [],
    animations: [],
    stats: {
      bones: 0,
      cubes: 0
    },
    textureSources: [],
    textures: []
  }
];

export interface NativeSeedState {
  projects: NativeProjectSnapshot[];
  folders: NativeProjectFolder[];
  rootChildren: NativeTreeChildRef[];
}

const cloneSeedHierarchyNode = (node: NativeHierarchyNode): NativeHierarchyNode => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  children: node.children.map((child) => cloneSeedHierarchyNode(child))
});

const cloneProjectSeed = (project: NativeProjectSnapshot): NativeProjectSnapshot => ({
  ...project,
  ...(project.focusAnchor
    ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] }
    : {}),
  hierarchy: project.hierarchy.map((node) => cloneSeedHierarchyNode(node)),
  animations: project.animations.map((animation) => ({ ...animation })),
  stats: { ...project.stats },
  textureSources: project.textureSources.map((source) => ({ ...source })),
  textures: project.textures.map((texture) => ({
    ...texture,
    faces: texture.faces.map((face) => ({ ...face })),
    uvEdges: texture.uvEdges.map((edge) => ({ ...edge }))
  }))
});

const cloneFolderSeed = (folder: NativeProjectFolder): NativeProjectFolder => ({
  folderId: folder.folderId,
  name: folder.name,
  parentFolderId: folder.parentFolderId,
  children: folder.children.map((entry) => ({ kind: entry.kind, id: entry.id }))
});

export const getDefaultSeedState = (): NativeSeedState => ({
  projects: seedProjects.map((project) => cloneProjectSeed(project)),
  folders: seedFolders.map((folder) => cloneFolderSeed(folder)),
  rootChildren: seedRootChildren.map((entry) => ({ kind: entry.kind, id: entry.id }))
});
