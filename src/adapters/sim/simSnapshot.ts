import type { SessionState, TrackedCube, TrackedTexture } from '../../session';
import type { CubeInstance, TextureInstance } from '../../types/blockbench';
import type { BlockbenchSimState } from './simTypes';
import { normalizeVec2, normalizeVec3 } from './simUtils';
import { resolveAnimationTimePolicy } from '../../domain/animation/timePolicy';

export const buildSnapshot = (state: BlockbenchSimState): SessionState => ({
  id: state.project.id,
  format: state.project.format,
  formatId: state.project.formatId ?? null,
  name: state.project.name,
  dirty: undefined,
  bones: [...state.bones],
  cubes: state.cubes.map((cube) => toTrackedCube(cube)),
  textures: state.textures.map((tex) => toTrackedTexture(tex)),
  animations: [...state.animations],
  animationsStatus: 'available',
  animationTimePolicy: resolveAnimationTimePolicy()
});

const toTrackedCube = (cube: CubeInstance): TrackedCube => {
  const from = normalizeVec3(cube.from) ?? [0, 0, 0];
  const to = normalizeVec3(cube.to) ?? [0, 0, 0];
  return {
    id: cube.id ?? undefined,
    name: cube.name ?? 'cube',
    from,
    to,
    bone: (cube as { bone?: string }).bone ?? 'root',
    origin: normalizeVec3(cube.origin) ?? undefined,
    rotation: normalizeVec3(cube.rotation) ?? undefined,
    uv: normalizeVec2(cube.uv) ?? undefined,
    uvOffset: normalizeVec2(cube.uv_offset) ?? undefined,
    inflate: cube.inflate,
    mirror: cube.mirror,
    visibility: cube.visibility,
    boxUv: cube.box_uv
  };
};

const toTrackedTexture = (tex: TextureInstance): TrackedTexture => ({
  id: tex.id ?? undefined,
  name: tex.name ?? 'texture',
  width: tex.width,
  height: tex.height,
  path: tex.path
});
