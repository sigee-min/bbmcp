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
  UpdateBoneCommand,
  UpdateCubeCommand
} from '../../ports/editor';
import { Logger } from '../../logging';
import { CUBE_FACE_DIRECTIONS } from '../../shared/toolConstants';
import { CubeFaceDirection, CubeFace, CubeInstance, TextureInstance } from '../../types/blockbench';
import {
  assignVec2,
  assignVec3,
  attachToOutliner,
  extendEntity,
  moveOutlinerNode,
  normalizeParent,
  readGlobals,
  renameEntity,
  removeOutlinerNode,
  setVisibility,
  withUndo
} from './blockbenchUtils';
import {
  collectCubes,
  findCubeRef,
  findGroup,
  findGroupRef,
  findTextureRef,
  resolveTargetCubes
} from './outlinerLookup';
import { withAdapterError, withToolErrorAdapterError } from './adapterErrors';
import { buildTextureUsageResult } from './BlockbenchTextureUsage';
import {
  ADAPTER_CUBE_API_UNAVAILABLE,
  ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE,
  ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE,
  ADAPTER_GROUP_API_UNAVAILABLE,
  MODEL_BONE_NOT_FOUND,
  MODEL_CUBE_NOT_FOUND,
  MODEL_PARENT_BONE_NOT_FOUND,
  TEXTURE_ASSIGN_NO_TARGETS,
  TEXTURE_NOT_FOUND,
  UV_ASSIGNMENT_FACES_NON_EMPTY
} from '../../shared/messages';

export class BlockbenchGeometryAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  addBone(params: BoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone add', 'bone add failed', () => {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_GROUP_API_UNAVAILABLE };
      }
      withUndo({ elements: true, outliner: true }, 'Add bone', () => {
        const parent = normalizeParent(findGroup(params.parent));
        const group = new GroupCtor({
          name: params.name,
          origin: params.pivot,
          rotation: params.rotation,
          scale: params.scale
        }).init?.();
        if (group) {
          setVisibility(group, params.visibility);
          if (params.id) group.bbmcpId = params.id;
          const attached = attachToOutliner(parent, outliner, group, this.log, 'bone');
          if (!attached && Array.isArray(outliner?.root)) {
            outliner.root.push(group);
          }
        }
      });
      this.log.info('bone added', { name: params.name, parent: params.parent });
      return null;
    });
  }

  updateBone(params: UpdateBoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone update', 'bone update failed', () => {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_GROUP_API_UNAVAILABLE };
      }
      const target = findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(label) };
      }
      if (params.id) {
        target.bbmcpId = params.id;
      }
      const parent = params.parentRoot ? null : params.parent ? findGroup(params.parent) : undefined;
      if (params.parent && !parent) {
        return { code: 'invalid_payload', message: MODEL_PARENT_BONE_NOT_FOUND(params.parent) };
      }
      withUndo({ elements: true, outliner: true }, 'Update bone', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        if (params.pivot) assignVec3(target, 'origin', params.pivot);
        if (params.rotation) assignVec3(target, 'rotation', params.rotation);
        if (params.scale) assignVec3(target, 'scale', params.scale);
        setVisibility(target, params.visibility);
        if (params.parentRoot || params.parent !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'bone');
        }
      });
      this.log.info('bone updated', { name: params.name, newName: params.newName, parent: params.parent });
      return null;
    });
  }

  deleteBone(params: DeleteBoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone delete', 'bone delete failed', () => {
      const globals = readGlobals();
      const GroupCtor = globals.Group;
      const outliner = globals.Outliner;
      if (typeof GroupCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_GROUP_API_UNAVAILABLE };
      }
      const target = findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(label) };
      }
      withUndo({ elements: true, outliner: true }, 'Delete bone', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('bone deleted', { name: target?.name ?? params.name });
      return null;
    });
  }

  addCube(params: CubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube add', 'cube add failed', () => {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_CUBE_API_UNAVAILABLE };
      }
      withUndo({ elements: true, outliner: true }, 'Add cube', () => {
        const parent = normalizeParent(findGroup(params.bone));
        const cube = new CubeCtor({
          name: params.name,
          from: params.from,
          to: params.to,
          origin: params.origin,
          rotation: params.rotation,
          uv_offset: params.uvOffset ?? params.uv,
          box_uv: params.boxUv,
          inflate: params.inflate,
          mirror_uv: params.mirror
        }).init?.();
        if (cube) {
          this.enforceManualUvMode(cube);
          if (typeof params.boxUv === 'boolean') {
            cube.box_uv = params.boxUv;
            if (typeof cube.setUVMode === 'function') {
              cube.setUVMode(params.boxUv);
            }
          }
          if (params.uvOffset) assignVec2(cube, 'uv_offset', params.uvOffset);
          setVisibility(cube, params.visibility);
          if (params.id) cube.bbmcpId = params.id;
          const attached = attachToOutliner(parent, outliner, cube, this.log, 'cube');
          if (!attached && Array.isArray(outliner?.root)) {
            outliner.root.push(cube);
          }
        }
      });
      this.log.info('cube added', { name: params.name, bone: params.bone });
      return null;
    });
  }

  updateCube(params: UpdateCubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube update', 'cube update failed', () => {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_CUBE_API_UNAVAILABLE };
      }
      const target = findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      if (params.id) {
        target.bbmcpId = params.id;
      }
      const parent = params.boneRoot ? null : params.bone ? findGroup(params.bone) : undefined;
      if (params.bone && !parent) {
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(params.bone) };
      }
      withUndo({ elements: true, outliner: true }, 'Update cube', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        this.enforceManualUvMode(target);
        if (params.from) assignVec3(target, 'from', params.from);
        if (params.to) assignVec3(target, 'to', params.to);
        if (params.origin) assignVec3(target, 'origin', params.origin);
        if (params.rotation) assignVec3(target, 'rotation', params.rotation);
        if (params.uv) assignVec2(target, 'uv_offset', params.uv);
        if (params.uvOffset) assignVec2(target, 'uv_offset', params.uvOffset);
        if (typeof params.inflate === 'number') target.inflate = params.inflate;
        if (typeof params.mirror === 'boolean') {
          target.mirror_uv = params.mirror;
          if (typeof target.mirror === 'boolean') target.mirror = params.mirror;
        }
        if (typeof params.boxUv === 'boolean') {
          target.box_uv = params.boxUv;
          if (typeof target.setUVMode === 'function') {
            target.setUVMode(params.boxUv);
          }
        }
        setVisibility(target, params.visibility);
        if (params.boneRoot || params.bone !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'cube');
        }
      });
      this.log.info('cube updated', { name: params.name, newName: params.newName, bone: params.bone });
      return null;
    });
  }

  deleteCube(params: DeleteCubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube delete', 'cube delete failed', () => {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const outliner = globals.Outliner;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_CUBE_API_UNAVAILABLE };
      }
      const target = findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      withUndo({ elements: true, outliner: true }, 'Delete cube', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('cube deleted', { name: target?.name ?? params.name });
      return null;
    });
  }

  assignTexture(params: AssignTextureCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'texture assign', 'texture assign failed', () => {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      const TextureCtor = globals.Texture;
      if (typeof CubeCtor === 'undefined' || typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE };
      }
      const texture = findTextureRef(params.textureName, params.textureId);
      if (!texture) {
        const label = params.textureId ?? params.textureName ?? 'unknown';
        return { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) };
      }
      const cubes = resolveTargetCubes(params);
      if (cubes.length === 0) {
        return { code: 'invalid_payload', message: TEXTURE_ASSIGN_NO_TARGETS };
      }
      const supportsApply = cubes.every((cube) => typeof cube.applyTexture === 'function');
      if (!supportsApply) {
        return { code: 'not_implemented', message: ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE };
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
              if (!extendEntity(face, { texture: textureRef })) {
                face.texture = textureRef;
              }
            });
          }
          uvBackup.forEach((uv, faceKey) => {
            if (!uv) return;
            const face = faceMap[faceKey];
            if (!face) return;
            if (!extendEntity(face, { uv })) {
              face.uv = uv;
            }
          });
        });
      });
      this.log.info('texture assigned', { texture: texture?.name, cubeCount: cubes.length, faces: faces ?? 'all' });
      return null;
    });
  }

  setFaceUv(params: SetFaceUvCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'face UV update', 'face UV update failed', () => {
      const globals = readGlobals();
      const CubeCtor = globals.Cube;
      if (typeof CubeCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_CUBE_API_UNAVAILABLE };
      }
      const target = findCubeRef(params.cubeName, params.cubeId);
      if (!target) {
        const label = params.cubeId ?? params.cubeName ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      const faceEntries = Object.entries(params.faces ?? {});
      if (faceEntries.length === 0) {
        return { code: 'invalid_payload', message: UV_ASSIGNMENT_FACES_NON_EMPTY };
      }
      const faceMap = ensureFaceMap(target);
      withUndo({ elements: true }, 'Set face UV', () => {
        this.enforceManualUvMode(target);
        faceEntries.forEach(([faceKey, uv]) => {
          if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection) || !uv) return;
          const face = faceMap[faceKey] ?? {};
          if (!faceMap[faceKey]) faceMap[faceKey] = face;
          if (!extendEntity(face, { uv: uv as [number, number, number, number] })) {
            face.uv = uv as [number, number, number, number];
          }
        });
      });
      this.log.info('face UV updated', { cube: target?.name ?? params.cubeName, faces: faceEntries.length });
      return null;
    });
  }

  getTextureUsage(params: TextureUsageQuery): { result?: TextureUsageResult; error?: ToolError } {
    return withAdapterError(
      this.log,
      'texture usage',
      'texture usage failed',
      () => {
        const globals = readGlobals();
        const CubeCtor = globals.Cube;
        const TextureCtor = globals.Texture;
        if (typeof CubeCtor === 'undefined' || typeof TextureCtor === 'undefined') {
          return { error: { code: 'not_implemented', message: ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE } };
        }
        const textures = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
        const cubes = collectCubes();
        return buildTextureUsageResult(params, { textures, cubes });
      },
      (error) => ({ error })
    );
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

}

const VALID_FACE_KEYS = new Set<CubeFaceDirection>(CUBE_FACE_DIRECTIONS);
const ALL_FACES: CubeFaceDirection[] = [...CUBE_FACE_DIRECTIONS];

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

const normalizeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | undefined => {
  if (!faces || faces.length === 0) return undefined;
  const valid = new Set<CubeFaceDirection>();
  faces.forEach((face) => {
    if (face) valid.add(face);
  });
  return valid.size > 0 ? Array.from(valid) : undefined;
};
