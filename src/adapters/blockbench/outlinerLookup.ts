import type { AssignTextureCommand } from '../../ports/editor';
import type { CubeInstance, GroupInstance, MeshInstance, OutlinerNode, TextureInstance } from '../../types/blockbench';
import { readGlobals, readNodeId, readTextureId } from './blockbenchUtils';

export const findGroup = (name?: string): GroupInstance | null => {
  if (!name) return null;
  return findOutlinerNode((node) => isGroupNode(node) && node.name === name);
};

export const findGroupRef = (name?: string, id?: string): GroupInstance | null => {
  if (id) {
    const byId = findOutlinerNode((node) => isGroupNode(node) && readNodeId(node) === id);
    if (byId) return byId;
  }
  if (name) return findGroup(name);
  return null;
};

const findCube = (name?: string): CubeInstance | null => {
  if (!name) return null;
  return findOutlinerNode((node) => isCubeNode(node) && node.name === name);
};

export const findCubeRef = (name?: string, id?: string): CubeInstance | null => {
  if (id) {
    const byId = findOutlinerNode((node) => isCubeNode(node) && readNodeId(node) === id);
    if (byId) return byId;
  }
  if (name) return findCube(name);
  return null;
};

const findMesh = (name?: string): MeshInstance | null => {
  if (!name) return null;
  return findOutlinerNode((node) => isMeshNode(node) && node.name === name);
};

export const findMeshRef = (name?: string, id?: string): MeshInstance | null => {
  if (id) {
    const byId = findOutlinerNode((node) => isMeshNode(node) && readNodeId(node) === id);
    if (byId) return byId;
  }
  if (name) return findMesh(name);
  return null;
};

const findOutlinerNode = (match: (node: OutlinerNode) => boolean): OutlinerNode | null => {
  const outliner = readGlobals().Outliner;
  const toArray = (value: OutlinerNode[] | OutlinerNode | null | undefined): OutlinerNode[] => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };
  const search = (nodes: OutlinerNode[] | OutlinerNode | null | undefined): OutlinerNode | null => {
    for (const n of toArray(nodes)) {
      if (match(n)) return n;
      const children = Array.isArray(n?.children) ? n.children : [];
      if (children.length > 0) {
        const found = search(children);
        if (found) return found;
      }
    }
    return null;
  };
  return search(outliner?.root ?? []);
};

export const resolveTargetCubes = (params: AssignTextureCommand): CubeInstance[] => {
  const all = collectCubes();
  const ids = new Set(params.cubeIds ?? []);
  const names = new Set(params.cubeNames ?? []);
  if (ids.size === 0 && names.size === 0) return all;
  return all.filter((cube) => {
    const id = readNodeId(cube) ?? undefined;
    const name = cube?.name ? String(cube.name) : undefined;
    return (id && ids.has(id)) || (name && names.has(name));
  });
};

export const collectCubes = (): CubeInstance[] => {
  const outliner = readGlobals().Outliner;
  const root = outliner?.root;
  const nodes = Array.isArray(root) ? root : root?.children ?? [];
  const cubes: CubeInstance[] = [];
  const walk = (items: OutlinerNode[] | undefined) => {
    if (!items) return;
    for (const node of items) {
      if (isCubeNode(node)) {
        cubes.push(node);
        continue;
      }
      const children = Array.isArray(node?.children) ? node.children : [];
      if (children.length > 0) {
        walk(children);
      }
    }
  };
  walk(nodes);
  return cubes;
};

export const findTextureRef = (name?: string, id?: string): TextureInstance | null => {
  const { Texture: TextureCtor } = readGlobals();
  const textures = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
  if (id) {
    const byId = textures.find((tex) => readTextureId(tex) === id);
    if (byId) return byId;
  }
  if (name) {
    return textures.find((tex) => tex?.name === name || tex?.id === name) ?? null;
  }
  return null;
};

const isGroupNode = (node: OutlinerNode): node is GroupInstance => {
  const groupCtor = readGlobals().Group;
  if (groupCtor && node instanceof groupCtor) return true;
  return Array.isArray(node.children);
};

const isCubeNode = (node: OutlinerNode): node is CubeInstance => {
  const cubeCtor = readGlobals().Cube;
  if (cubeCtor && node instanceof cubeCtor) return true;
  return node.from !== undefined && node.to !== undefined;
};

const isMeshNode = (node: OutlinerNode): node is MeshInstance => {
  const meshCtor = readGlobals().Mesh;
  if (meshCtor && node instanceof meshCtor) return true;
  if (node.from !== undefined && node.to !== undefined) return false;
  return node.vertices !== undefined && node.faces !== undefined;
};


