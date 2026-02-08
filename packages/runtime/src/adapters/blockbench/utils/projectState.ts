import type { BlockbenchApi } from '../../../types/blockbench';
import { readGlobals } from './globals';

export const hasUnsavedChanges = (blockbench: BlockbenchApi | undefined): boolean => {
  try {
    if (typeof blockbench?.hasUnsavedChanges === 'function') {
      const result = blockbench.hasUnsavedChanges();
      if (typeof result === 'boolean') return result;
    }
    const project = blockbench?.project ?? readGlobals().Project ?? null;
    if (project) {
      if (typeof project.saved === 'boolean') return !project.saved;
      if (typeof project.isSaved === 'boolean') return !project.isSaved;
      if (typeof project.dirty === 'boolean') return project.dirty;
      if (typeof project.isDirty === 'boolean') return project.isDirty;
      if (typeof project.unsaved === 'boolean') return project.unsaved;
      if (typeof project.hasUnsavedChanges === 'function') {
        return Boolean(project.hasUnsavedChanges());
      }
    }
  } catch (_err) {
    return false;
  }
  return false;
};

export const markProjectSaved = (blockbench: BlockbenchApi | undefined): void => {
  try {
    const project = blockbench?.project ?? readGlobals().Project ?? null;
    if (!project) return;
    if (typeof project.markSaved === 'function') {
      project.markSaved();
    }
    if (typeof project.saved === 'boolean') project.saved = true;
    if (typeof project.isSaved === 'boolean') project.isSaved = true;
    if (typeof project.dirty === 'boolean') project.dirty = false;
    if (typeof project.isDirty === 'boolean') project.isDirty = false;
    if (typeof project.unsaved === 'boolean') project.unsaved = false;
  } catch (_err) {
    // Best-effort: some Blockbench builds may not expose these fields.
  }
};
