import { cloneProject } from './clone';
import { getDefaultProjects } from './seeds';
import type { NativePipelineState } from './state';
import type { NativeProjectSnapshot } from './types';

export const seedProjects = (state: NativePipelineState, emitProjectSnapshot: (project: NativeProjectSnapshot) => void): void => {
  for (const project of getDefaultProjects()) {
    state.projects.set(project.projectId, project);
    emitProjectSnapshot(project);
  }
};

export const listProjects = (state: NativePipelineState, query?: string): NativeProjectSnapshot[] => {
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
  return Array.from(state.projects.values())
    .filter((project) => {
      if (!normalizedQuery) return true;
      return (
        project.projectId.toLowerCase().includes(normalizedQuery) ||
        project.name.toLowerCase().includes(normalizedQuery)
      );
    })
    .map((project) => cloneProject(project));
};

export const getProject = (state: NativePipelineState, projectId: string): NativeProjectSnapshot | null => {
  const project = state.projects.get(projectId);
  return project ? cloneProject(project) : null;
};

export const ensureProject = (
  state: NativePipelineState,
  projectId: string,
  emitProjectSnapshot: (project: NativeProjectSnapshot) => void
): NativeProjectSnapshot => {
  const existing = state.projects.get(projectId);
  if (existing) return existing;

  const created: NativeProjectSnapshot = {
    projectId,
    name: projectId,
    revision: 1,
    hasGeometry: false,
    focusAnchor: [0, 24, 0],
    hierarchy: [],
    animations: [],
    stats: {
      bones: 0,
      cubes: 0
    }
  };
  state.projects.set(projectId, created);
  emitProjectSnapshot(created);
  return created;
};
