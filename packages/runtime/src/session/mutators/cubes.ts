import type { CubeUpdate, SessionState, TrackedCube } from '../types';

export const addCube = (state: SessionState, cube: TrackedCube) => {
  state.cubes.push(cube);
};

export const updateCube = (state: SessionState, name: string, updates: CubeUpdate): boolean => {
  const cube = state.cubes.find((c) => c.name === name);
  if (!cube) return false;
  if (updates.id) cube.id = updates.id;
  if (updates.newName && updates.newName !== cube.name) cube.name = updates.newName;
  if (updates.bone) cube.bone = updates.bone;
  if (updates.from) cube.from = updates.from;
  if (updates.to) cube.to = updates.to;
  if (updates.origin) cube.origin = updates.origin;
  if (updates.rotation) cube.rotation = updates.rotation;
  if (updates.uv) cube.uv = updates.uv;
  if (updates.uvOffset) cube.uvOffset = updates.uvOffset;
  if (typeof updates.inflate === 'number') cube.inflate = updates.inflate;
  if (typeof updates.mirror === 'boolean') cube.mirror = updates.mirror;
  if (typeof updates.visibility === 'boolean') cube.visibility = updates.visibility;
  if (typeof updates.boxUv === 'boolean') cube.boxUv = updates.boxUv;
  return true;
};

export const removeCubes = (state: SessionState, names: string[] | Set<string>): number => {
  const nameSet = names instanceof Set ? names : new Set(names);
  const before = state.cubes.length;
  state.cubes = state.cubes.filter((c) => !nameSet.has(c.name));
  return before - state.cubes.length;
};


