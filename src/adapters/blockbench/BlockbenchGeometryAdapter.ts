import { ToolError } from '../../types';
import {
  BoneCommand,
  CubeCommand,
  DeleteBoneCommand,
  DeleteCubeCommand,
  UpdateBoneCommand,
  UpdateCubeCommand
} from '../../ports/editor';
import { Logger } from '../../logging';
import {
  CubeInstance,
  GroupInstance,
  OutlinerApi,
  OutlinerNode
} from '../../types/blockbench';
import {
  assignVec2,
  assignVec3,
  attachToOutliner,
  moveOutlinerNode,
  normalizeParent,
  readGlobals,
  readNodeId,
  removeOutlinerNode,
  withUndo
} from './blockbenchUtils';

export class BlockbenchGeometryAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  addBone(params: BoneCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Group API not available' };
      }
      withUndo({ elements: true, outliner: true }, 'Add bone', () => {
        const parent = normalizeParent(this.findGroup(params.parent));
        const group = new GroupCtor({
          name: params.name,
          origin: params.pivot,
          rotation: params.rotation,
          scale: params.scale
        }).init?.();
        if (group) {
          if (params.id) group.bbmcpId = params.id;
          const attached = attachToOutliner(parent, outliner, group, this.log, 'bone');
          if (!attached && outliner?.root?.push) {
            outliner.root.push(group);
          }
        }
      });
      this.log.info('bone added', { name: params.name, parent: params.parent });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'bone add failed';
      this.log.error('bone add error', { message });
      return { code: 'unknown', message };
    }
  }

  updateBone(params: UpdateBoneCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Group API not available' };
      }
      const target = this.findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Bone not found: ${label}` };
      }
      if (params.id) {
        target.bbmcpId = params.id;
      }
      const parent = params.parentRoot ? null : params.parent ? this.findGroup(params.parent) : undefined;
      if (params.parent && !parent) {
        return { code: 'invalid_payload', message: `Parent bone not found: ${params.parent}` };
      }
      withUndo({ elements: true, outliner: true }, 'Update bone', () => {
        if (params.newName && params.newName !== target.name) {
          if (typeof target.rename === 'function') {
            target.rename(params.newName);
          } else {
            target.name = params.newName;
          }
        }
        if (params.pivot) assignVec3(target, 'origin', params.pivot);
        if (params.rotation) assignVec3(target, 'rotation', params.rotation);
        if (params.scale) assignVec3(target, 'scale', params.scale);
        if (params.parentRoot || params.parent !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'bone');
        }
      });
      this.log.info('bone updated', { name: params.name, newName: params.newName, parent: params.parent });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'bone update failed';
      this.log.error('bone update error', { message });
      return { code: 'unknown', message };
    }
  }

  deleteBone(params: DeleteBoneCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Group API not available' };
      }
      const target = this.findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Bone not found: ${label}` };
      }
      withUndo({ elements: true, outliner: true }, 'Delete bone', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('bone deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'bone delete failed';
      this.log.error('bone delete error', { message });
      return { code: 'unknown', message };
    }
  }

  addCube(params: CubeCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Cube API not available' };
      }
      withUndo({ elements: true, outliner: true }, 'Add cube', () => {
        const parent = normalizeParent(this.findGroup(params.bone));
        const cube = new CubeCtor({
          name: params.name,
          from: params.from,
          to: params.to,
          uv_offset: params.uv,
          inflate: params.inflate,
          mirror_uv: params.mirror
        }).init?.();
        if (cube) {
          if (params.id) cube.bbmcpId = params.id;
          const attached = attachToOutliner(parent, outliner, cube, this.log, 'cube');
          if (!attached && outliner?.root?.push) {
            outliner.root.push(cube);
          }
        }
      });
      this.log.info('cube added', { name: params.name, bone: params.bone });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cube add failed';
      this.log.error('cube add error', { message });
      return { code: 'unknown', message };
    }
  }

  updateCube(params: UpdateCubeCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Cube API not available' };
      }
      const target = this.findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Cube not found: ${label}` };
      }
      if (params.id) {
        target.bbmcpId = params.id;
      }
      const parent = params.boneRoot ? null : params.bone ? this.findGroup(params.bone) : undefined;
      if (params.bone && !parent) {
        return { code: 'invalid_payload', message: `Bone not found: ${params.bone}` };
      }
      withUndo({ elements: true, outliner: true }, 'Update cube', () => {
        if (params.newName && params.newName !== target.name) {
          if (typeof target.rename === 'function') {
            target.rename(params.newName);
          } else {
            target.name = params.newName;
          }
        }
        if (params.from) assignVec3(target, 'from', params.from);
        if (params.to) assignVec3(target, 'to', params.to);
        if (params.uv) assignVec2(target, 'uv_offset', params.uv);
        if (typeof params.inflate === 'number') target.inflate = params.inflate;
        if (typeof params.mirror === 'boolean') {
          target.mirror_uv = params.mirror;
          if (typeof target.mirror === 'boolean') target.mirror = params.mirror;
        }
        if (params.boneRoot || params.bone !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'cube');
        }
      });
      this.log.info('cube updated', { name: params.name, newName: params.newName, bone: params.bone });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cube update failed';
      this.log.error('cube update error', { message });
      return { code: 'unknown', message };
    }
  }

  deleteCube(params: DeleteCubeCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Cube API not available' };
      }
      const target = this.findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Cube not found: ${label}` };
      }
      withUndo({ elements: true, outliner: true }, 'Delete cube', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('cube deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cube delete failed';
      this.log.error('cube delete error', { message });
      return { code: 'unknown', message };
    }
  }

  private findGroup(name?: string): GroupInstance | null {
    if (!name) return null;
    return this.findOutlinerNode((node) => isGroupNode(node) && node.name === name);
  }

  private findGroupRef(name?: string, id?: string): GroupInstance | null {
    if (id) {
      const byId = this.findOutlinerNode((node) => isGroupNode(node) && readNodeId(node) === id);
      if (byId) return byId;
    }
    if (name) return this.findGroup(name);
    return null;
  }

  private findCube(name?: string): CubeInstance | null {
    if (!name) return null;
    return this.findOutlinerNode((node) => isCubeNode(node) && node.name === name);
  }

  private findCubeRef(name?: string, id?: string): CubeInstance | null {
    if (id) {
      const byId = this.findOutlinerNode((node) => isCubeNode(node) && readNodeId(node) === id);
      if (byId) return byId;
    }
    if (name) return this.findCube(name);
    return null;
  }

  private findOutlinerNode(match: (node: OutlinerNode) => boolean): OutlinerNode | null {
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
  }
}

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
