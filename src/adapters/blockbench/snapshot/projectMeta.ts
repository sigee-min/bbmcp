import type { BlockbenchGlobals } from '../../../types/blockbench';
import { FormatKind, FORMAT_KINDS } from '@ashfox/contracts/types/internal';
import { matchesFormatKind } from '../../../domain/formats';

export const getProjectName = (globals: BlockbenchGlobals): string | null => {
  const project = globals.Project ?? globals.Blockbench?.project ?? null;
  return project?.name ?? null;
};

export const getProjectId = (globals: BlockbenchGlobals): string | null => {
  const project = globals.Project ?? globals.Blockbench?.project ?? null;
  const id = project?.uuid ?? project?.id ?? project?.uid ?? null;
  return id ? String(id) : null;
};

export const getProjectDirty = (globals: BlockbenchGlobals): boolean | undefined => {
  try {
    const blockbench = globals.Blockbench;
    if (typeof blockbench?.hasUnsavedChanges === 'function') {
      const result = blockbench.hasUnsavedChanges();
      if (typeof result === 'boolean') return result;
    }
    const project = globals.Project ?? blockbench?.project ?? null;
    if (!project) return undefined;
    if (typeof project.saved === 'boolean') return !project.saved;
    if (typeof project.isSaved === 'boolean') return !project.isSaved;
    if (typeof project.dirty === 'boolean') return project.dirty;
    if (typeof project.isDirty === 'boolean') return project.isDirty;
    if (typeof project.unsaved === 'boolean') return project.unsaved;
    if (typeof project.hasUnsavedChanges === 'function') {
      return Boolean(project.hasUnsavedChanges());
    }
  } catch (err) {
    return undefined;
  }
  return undefined;
};

export const getActiveFormatId = (globals: BlockbenchGlobals): string | null => {
  const active = globals.Format ?? globals.ModelFormat?.selected ?? null;
  return active?.id ?? null;
};

export const guessFormatKind = (formatId: string | null): FormatKind | null => {
  if (!formatId) return null;
  return FORMAT_KINDS.find((kind) => matchesFormatKind(kind, formatId)) ?? null;
};

