import { ToolError } from '../../types';
import {
  AssignTextureCommand,
  BoneCommand,
  CubeCommand,
  DeleteBoneCommand,
  DeleteCubeCommand,
  SetFaceUvCommand,
  TextureUsageQuery,
  TextureUsageResult,
  TextureUsageUnresolved,
  UpdateBoneCommand,
  UpdateCubeCommand
} from '../../ports/editor';
import { Logger } from '../../logging';
import {
  CubeFaceDirection,
  CubeFace,
  CubeInstance,
  GroupInstance,
  OutlinerApi,
  OutlinerNode,
  TextureInstance
} from '../../types/blockbench';
import {
  assignVec2,
  assignVec3,
  attachToOutliner,
  moveOutlinerNode,
  normalizeParent,
  readGlobals,
  readNodeId,
  readTextureAliases,
  readTextureId,
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
          if (!attached && Array.isArray(outliner?.root)) {
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
          this.enforceManualUvMode(cube);
          if (params.id) cube.bbmcpId = params.id;
          const attached = attachToOutliner(parent, outliner, cube, this.log, 'cube');
          if (!attached && Array.isArray(outliner?.root)) {
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
        this.enforceManualUvMode(target);
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

  assignTexture(params: AssignTextureCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const TextureCtor = globals.Texture;
      if (typeof CubeCtor === 'undefined' || typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Cube/Texture API not available' };
      }
      const texture = this.findTextureRef(params.textureName, params.textureId);
      if (!texture) {
        const label = params.textureId ?? params.textureName ?? 'unknown';
        return { code: 'invalid_payload', message: `Texture not found: ${label}` };
      }
      const cubes = this.resolveTargetCubes(params);
      if (cubes.length === 0) {
        return { code: 'invalid_payload', message: 'No target cubes found' };
      }
      const supportsApply = cubes.every((cube) => typeof cube.applyTexture === 'function');
      if (!supportsApply) {
        return { code: 'not_implemented', message: 'Cube.applyTexture is not available' };
      }
      const faces = normalizeFaces(params.faces);
      const textureRef = resolveFaceTextureRef(texture);
      withUndo({ elements: true, textures: true }, 'Assign texture', () => {
        cubes.forEach((cube) => {
          this.enforceManualUvMode(cube);
          const faceMap = ensureFaceMap(cube);
          const targets = faces ?? ALL_FACES;
          const uvBackup = new Map<CubeFaceDirection, [number, number, number, number] | undefined>();
          targets.forEach((faceKey) => {
            const face = faceMap[faceKey];
            if (face?.uv) {
              uvBackup.set(faceKey, [...face.uv]);
            }
          });
          cube.applyTexture?.(texture, faces ?? true);
          if (textureRef) {
            targets.forEach((faceKey) => {
              const face = faceMap[faceKey] ?? {};
              if (!faceMap[faceKey]) faceMap[faceKey] = face;
              if (typeof face.extend === 'function') {
                face.extend({ texture: textureRef });
              } else {
                face.texture = textureRef;
              }
            });
          }
          uvBackup.forEach((uv, faceKey) => {
            if (!uv) return;
            const face = faceMap[faceKey];
            if (!face) return;
            if (typeof face.extend === 'function') {
              face.extend({ uv });
            } else {
              face.uv = uv;
            }
          });
        });
      });
      this.log.info('texture assigned', { texture: texture?.name, cubeCount: cubes.length, faces: faces ?? 'all' });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture assign failed';
      this.log.error('texture assign error', { message });
      return { code: 'unknown', message };
    }
  }

  setFaceUv(params: SetFaceUvCommand): ToolError | null {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Cube API not available' };
      }
      const target = this.findCubeRef(params.cubeName, params.cubeId);
      if (!target) {
        const label = params.cubeId ?? params.cubeName ?? 'unknown';
        return { code: 'invalid_payload', message: `Cube not found: ${label}` };
      }
      const faceEntries = Object.entries(params.faces ?? {});
      if (faceEntries.length === 0) {
        return { code: 'invalid_payload', message: 'faces must include at least one mapping' };
      }
      const faceMap = ensureFaceMap(target);
      withUndo({ elements: true }, 'Set face UV', () => {
        this.enforceManualUvMode(target);
        faceEntries.forEach(([faceKey, uv]) => {
          if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection) || !uv) return;
          const face = faceMap[faceKey] ?? {};
          if (!faceMap[faceKey]) faceMap[faceKey] = face;
          if (typeof face.extend === 'function') {
            face.extend({ uv: uv as [number, number, number, number] });
          } else {
            face.uv = uv as [number, number, number, number];
          }
        });
      });
      this.log.info('face UV updated', { cube: target?.name ?? params.cubeName, faces: faceEntries.length });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'face UV update failed';
      this.log.error('face UV update error', { message });
      return { code: 'unknown', message };
    }
  }

  getTextureUsage(params: TextureUsageQuery): { result?: TextureUsageResult; error?: ToolError } {
    try {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const TextureCtor = globals.Texture;
      if (typeof CubeCtor === 'undefined' || typeof TextureCtor === 'undefined') {
        return { error: { code: 'not_implemented', message: 'Cube/Texture API not available' } };
      }
      const textures = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
      const usageMap = new Map<
        string,
        {
          id?: string;
          name: string;
          cubes: Map<
            string,
            { id?: string; name: string; faces: Map<CubeFaceDirection, { face: CubeFaceDirection; uv?: [number, number, number, number] }> }
          >;
          faceCount: number;
        }
      >();
      const byId = new Map<string, string>();
      const byName = new Map<string, string>();
      const metaByKey = new Map<string, { id?: string; name: string }>();
      textures.forEach((tex) => {
        const id = readTextureId(tex) ?? undefined;
        const name = tex?.name ?? tex?.id ?? 'texture';
        const key = id ? `id:${id}` : `name:${name}`;
        metaByKey.set(key, { id, name });
        const aliases = readTextureAliases(tex);
        aliases.forEach((alias) => {
          if (!byId.has(alias)) {
            byId.set(alias, key);
          }
        });
        if (name) byName.set(name, key);
      });

      const targetKeys = new Set<string>(metaByKey.keys());
      if (params.textureId || params.textureName) {
        const label = params.textureId ?? params.textureName ?? 'unknown';
        const match =
          (params.textureId && byId.get(params.textureId)) ||
          (params.textureName && byName.get(params.textureName)) ||
          null;
        if (!match) {
          return { error: { code: 'invalid_payload', message: `Texture not found: ${label}` } };
        }
        targetKeys.clear();
        targetKeys.add(match);
      }

      targetKeys.forEach((key) => {
        const meta = metaByKey.get(key);
        if (!meta) return;
        usageMap.set(key, { id: meta.id, name: meta.name, cubes: new Map(), faceCount: 0 });
      });

      const unresolved: TextureUsageUnresolved[] = [];
      const cubes = this.collectCubes();
      cubes.forEach((cube) => {
        const cubeId = readNodeId(cube) ?? undefined;
        const cubeName = cube?.name ? String(cube.name) : 'cube';
        const faces = cube.faces ?? {};
        Object.entries(faces).forEach(([faceKey, face]) => {
          if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection)) return;
          const ref = face?.texture;
          if (ref === false || ref === undefined || ref === null) return;
          const refValue = typeof ref === 'string' ? ref : String(ref);
          const key = resolveTextureKey(refValue, byId, byName);
          if (!key) {
            unresolved.push({ textureRef: refValue, cubeId, cubeName, face: faceKey as CubeFaceDirection });
            return;
          }
          if (!targetKeys.has(key)) return;
          const entry = usageMap.get(key);
          if (!entry) return;
          const cubeKey = cubeId ? `id:${cubeId}` : `name:${cubeName}`;
          let cubeEntry = entry.cubes.get(cubeKey);
          if (!cubeEntry) {
            cubeEntry = { id: cubeId, name: cubeName, faces: new Map() };
            entry.cubes.set(cubeKey, cubeEntry);
          }
          const faceDir = faceKey as CubeFaceDirection;
          if (!cubeEntry.faces.has(faceDir)) {
            cubeEntry.faces.set(faceDir, { face: faceDir, uv: normalizeFaceUv(face?.uv) });
          } else {
            const existing = cubeEntry.faces.get(faceDir);
            if (existing && !existing.uv) {
              existing.uv = normalizeFaceUv(face?.uv);
            }
          }
          entry.faceCount += 1;
        });
      });

      const texturesResult = Array.from(usageMap.values()).map((entry) => ({
        id: entry.id,
        name: entry.name,
        cubeCount: entry.cubes.size,
        faceCount: entry.faceCount,
        cubes: Array.from(entry.cubes.values()).map((cube) => ({
          id: cube.id,
          name: cube.name,
          faces: Array.from(cube.faces.values())
        }))
      }));
      const result: TextureUsageResult = {
        textures: texturesResult,
        ...(unresolved.length > 0 ? { unresolved } : {})
      };
      return { result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture usage failed';
      this.log.error('texture usage error', { message });
      return { error: { code: 'unknown', message } };
    }
  }

  private findGroup(name?: string): GroupInstance | null {
    if (!name) return null;
    return this.findOutlinerNode((node) => isGroupNode(node) && node.name === name);
  }

  private enforceManualUvMode(cube: CubeInstance): void {
    if (typeof cube.setUVMode === 'function') {
      cube.setUVMode(false);
    } else if (typeof cube.box_uv === 'boolean') {
      cube.box_uv = false;
    }
    if (typeof cube.autouv === 'number') {
      cube.autouv = 0;
    }
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

  private resolveTargetCubes(params: AssignTextureCommand): CubeInstance[] {
    const all = this.collectCubes();
    const ids = new Set(params.cubeIds ?? []);
    const names = new Set(params.cubeNames ?? []);
    if (ids.size === 0 && names.size === 0) return all;
    return all.filter((cube) => {
      const id = readNodeId(cube) ?? undefined;
      const name = cube?.name ? String(cube.name) : undefined;
      return (id && ids.has(id)) || (name && names.has(name));
    });
  }

  private collectCubes(): CubeInstance[] {
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
  }

  private findTextureRef(name?: string, id?: string): TextureInstance | null {
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
  }
}

const VALID_FACE_KEYS = new Set<CubeFaceDirection>(['north', 'south', 'east', 'west', 'up', 'down']);
const ALL_FACES: CubeFaceDirection[] = ['north', 'south', 'east', 'west', 'up', 'down'];

const resolveTextureKey = (ref: string, byId: Map<string, string>, byName: Map<string, string>): string | null => {
  if (byId.has(ref)) return byId.get(ref) ?? null;
  if (byName.has(ref)) return byName.get(ref) ?? null;
  return null;
};

const resolveFaceTextureRef = (texture: TextureInstance | null | undefined): string | null => {
  if (!texture) return null;
  const raw = texture.uuid ?? texture.id ?? texture.bbmcpId ?? texture.name ?? null;
  return raw ? String(raw) : null;
};

const ensureFaceMap = (cube: CubeInstance): Record<string, CubeFace> => {
  if (!cube.faces || typeof cube.faces !== 'object') {
    cube.faces = {};
  }
  return cube.faces as Record<string, CubeFace>;
};

const normalizeFaceUv = (value: unknown): [number, number, number, number] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value) && value.length >= 4) {
    const [x1, y1, x2, y2] = value;
    if ([x1, y1, x2, y2].every((v) => typeof v === 'number')) {
      return [x1, y1, x2, y2];
    }
  }
  return undefined;
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

const normalizeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | undefined => {
  if (!faces || faces.length === 0) return undefined;
  const valid = new Set<CubeFaceDirection>();
  faces.forEach((face) => {
    if (face) valid.add(face);
  });
  return valid.size > 0 ? Array.from(valid) : undefined;
};
