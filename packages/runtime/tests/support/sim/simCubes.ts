import type {
  AssignTextureCommand,
  SetFaceUvCommand,
  CubeCommand,
  UpdateCubeCommand,
  DeleteCubeCommand
} from '../../../src/ports/editor';
import type { CubeFaceDirection, CubeInstance, TextureInstance } from '../../../src/types/blockbench';
import type { ToolError } from '/contracts/types/internal';
import type { BlockbenchSimState, SimCounters } from './simTypes';
import { CUBE_FACE_DIRECTIONS } from '../../../src/shared/toolConstants';
import { ensureFaces, error } from './simUtils';

export type SimCubeContext = {
  state: BlockbenchSimState;
  counters: SimCounters;
  findTexture: (id?: string, name?: string) => TextureInstance | null;
  applyAutoUv: (cube: CubeInstance) => void;
  enforceManualUvMode: (cube: CubeInstance, options?: { preserve?: boolean }) => void;
};

export const createCubeOps = (ctx: SimCubeContext) => {
  const resolveCubes = (ids?: string[], names?: string[]): CubeInstance[] => {
    const idSet = new Set(ids ?? []);
    const nameSet = new Set(names ?? []);
    return ctx.state.cubes.filter((cube) => {
      if (idSet.size === 0 && nameSet.size === 0) return true;
      if (cube.id && idSet.has(cube.id)) return true;
      if (cube.name && nameSet.has(cube.name)) return true;
      return false;
    });
  };

  const findCube = (id?: string, name?: string): CubeInstance | null =>
    ctx.state.cubes.find((cube) => (id && cube.id === id) || (name && cube.name === name)) ?? null;

  const normalizeCube = (
    cube: Pick<
      CubeInstance,
      'id' | 'name' | 'from' | 'to' | 'origin' | 'rotation' | 'uv' | 'uv_offset' | 'inflate' | 'mirror' | 'visibility' | 'box_uv' | 'faces'
    >
  ): CubeInstance => {
    const id = cube.id ?? `cube-${ctx.counters.nextCubeId++}`;
    const name = cube.name ?? id;
    const normalized: CubeInstance = {
      id,
      name,
      from: cube.from ?? [0, 0, 0],
      to: cube.to ?? [0, 0, 0],
      origin: cube.origin,
      rotation: cube.rotation,
      uv: cube.uv,
      uv_offset: cube.uv_offset,
      inflate: cube.inflate,
      mirror: cube.mirror,
      visibility: cube.visibility,
      box_uv: cube.box_uv,
      faces: cube.faces ?? {}
    };
    ensureFaces(normalized);
    return normalized;
  };

  const addCube = (params: CubeCommand): ToolError | null => {
    const name = params.name ?? `cube_${ctx.counters.nextCubeId}`;
    const id = params.id ?? `cube-${ctx.counters.nextCubeId++}`;
    const cube: CubeInstance = {
      id,
      name,
      from: params.from,
      to: params.to,
      origin: params.origin,
      rotation: params.rotation,
      uv: params.uv,
      uv_offset: params.uvOffset,
      inflate: params.inflate,
      mirror: params.mirror,
      visibility: params.visibility,
      box_uv: params.boxUv,
      faces: {}
    };
    ensureFaces(cube);
    ctx.applyAutoUv(cube);
    ctx.state.cubes.push(cube);
    return null;
  };

  const updateCube = (params: UpdateCubeCommand): ToolError | null => {
    const cube = findCube(params.id, params.name);
    if (!cube) return error('invalid_payload', `Cube not found: ${params.name ?? params.id ?? 'unknown'}`);
    const wantsManualUv = Boolean(params.uv || params.uvOffset) || params.boxUv === false;
    if (wantsManualUv) {
      ctx.enforceManualUvMode(cube, { preserve: true });
    }
    if (params.newName) cube.name = params.newName;
    if (params.from) cube.from = params.from;
    if (params.to) cube.to = params.to;
    if (params.origin) cube.origin = params.origin;
    if (params.rotation) cube.rotation = params.rotation;
    if (params.uv) cube.uv = params.uv;
    if (params.uvOffset) cube.uv_offset = params.uvOffset;
    if (params.inflate !== undefined) cube.inflate = params.inflate;
    if (params.mirror !== undefined) cube.mirror = params.mirror;
    if (params.visibility !== undefined) cube.visibility = params.visibility;
    if (params.boxUv !== undefined) cube.box_uv = params.boxUv;
    ctx.applyAutoUv(cube);
    return null;
  };

  const deleteCube = (params: DeleteCubeCommand): ToolError | null => {
    const before = ctx.state.cubes.length;
    ctx.state.cubes = ctx.state.cubes.filter(
      (cube) => !((params.id && cube.id === params.id) || (params.name && cube.name === params.name))
    );
    if (before === ctx.state.cubes.length) {
      return error('invalid_payload', `Cube not found: ${params.name ?? params.id ?? 'unknown'}`);
    }
    return null;
  };

  const assignTexture = (params: AssignTextureCommand): ToolError | null => {
    const texture = ctx.findTexture(params.textureId, params.textureName);
    if (!texture) {
      return error('invalid_payload', `Texture not found: ${params.textureName ?? params.textureId ?? 'unknown'}`);
    }
    const cubeTargets = resolveCubes(params.cubeIds, params.cubeNames);
    if (cubeTargets.length === 0) {
      return error('invalid_payload', 'No cubes matched for assignment.');
    }
    const faceTargets = params.faces && params.faces.length > 0 ? params.faces : CUBE_FACE_DIRECTIONS;
    const ref = texture.id ?? texture.name ?? params.textureName ?? params.textureId ?? 'texture';
    for (const cube of cubeTargets) {
      ctx.enforceManualUvMode(cube, { preserve: true });
      const faces = ensureFaces(cube);
      faceTargets.forEach((face) => {
        const entry = faces[face] ?? { texture: false };
        entry.texture = ref;
        faces[face] = entry;
      });
    }
    return null;
  };

  const setFaceUv = (params: SetFaceUvCommand): ToolError | null => {
    const cube = findCube(params.cubeId, params.cubeName);
    if (!cube) {
      return error('invalid_payload', `Cube not found: ${params.cubeName ?? params.cubeId ?? 'unknown'}`);
    }
    ctx.enforceManualUvMode(cube, { preserve: true });
    const faces = ensureFaces(cube);
    Object.entries(params.faces ?? {}).forEach(([faceKey, uv]) => {
      const key = faceKey as CubeFaceDirection;
      const entry = faces[key] ?? { texture: false };
      entry.uv = [uv[0], uv[1], uv[2], uv[3]];
      faces[key] = entry;
    });
    return null;
  };

  return {
    resolveCubes,
    findCube,
    normalizeCube,
    addCube,
    updateCube,
    deleteCube,
    assignTexture,
    setFaceUv
  };
};
