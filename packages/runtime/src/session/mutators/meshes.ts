import type { MeshUpdate, SessionState, TrackedMesh } from '../types';

export const addMesh = (state: SessionState, mesh: TrackedMesh) => {
  state.meshes ??= [];
  state.meshes.push(mesh);
};

export const updateMesh = (state: SessionState, name: string, updates: MeshUpdate): boolean => {
  state.meshes ??= [];
  const mesh = state.meshes.find((m) => m.name === name);
  if (!mesh) return false;
  if (updates.id) mesh.id = updates.id;
  if (updates.newName && updates.newName !== mesh.name) mesh.name = updates.newName;
  if (updates.bone !== undefined) mesh.bone = updates.bone ?? undefined;
  if (updates.origin) mesh.origin = updates.origin;
  if (updates.rotation) mesh.rotation = updates.rotation;
  if (typeof updates.visibility === 'boolean') mesh.visibility = updates.visibility;
  if (updates.uvPolicy) mesh.uvPolicy = updates.uvPolicy;
  if (updates.vertices) mesh.vertices = updates.vertices;
  if (updates.faces) mesh.faces = updates.faces;
  return true;
};

export const removeMeshes = (state: SessionState, names: string[] | Set<string>): number => {
  state.meshes ??= [];
  const nameSet = names instanceof Set ? names : new Set(names);
  const before = state.meshes.length;
  state.meshes = state.meshes.filter((m) => !nameSet.has(m.name));
  return before - state.meshes.length;
};
