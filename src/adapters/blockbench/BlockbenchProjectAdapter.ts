import { FormatKind, ToolError } from '../../types';
import { errorMessage, Logger } from '../../logging';
import { hasUnsavedChanges, markProjectSaved, readGlobals } from './blockbenchUtils';
import { toolError } from '../../services/toolResponse';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
  ADAPTER_PROJECT_CREATE_UNAVAILABLE,
  ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
  ADAPTER_PROJECT_UNSAVED_CHANGES,
  PROJECT_NO_ACTIVE
} from '../../shared/messages';

export class BlockbenchProjectAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  createProject(
    name: string,
    formatId: string,
    kind: FormatKind,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; confirmDialog?: boolean }
  ): ToolError | null {
    try {
      const globals = readGlobals();
      const blockbench = globals.Blockbench;
      const modelFormat = globals.ModelFormat;
      const resolvedId = String(formatId ?? '');
      const formats = globals.Formats ?? modelFormat?.formats ?? null;
      const hasUnsaved = hasUnsavedChanges(blockbench);
      if (hasUnsaved) {
        if (options?.confirmDiscard === false) {
          return {
            code: 'invalid_state',
            message: ADAPTER_PROJECT_UNSAVED_CHANGES
          };
        }
        if (!options?.confirmDiscard) {
          this.log.warn('auto-discarding unsaved changes for project creation', { name, format: kind });
        } else {
          this.log.warn('discarding unsaved changes for project creation', { name, format: kind });
        }
        markProjectSaved(blockbench);
      }
      const formatEntry = formats?.[resolvedId];
      const canCreate =
        typeof formatEntry?.new === 'function' ||
        typeof blockbench?.newProject === 'function' ||
        typeof modelFormat?.new === 'function';
      if (!canCreate) {
        return { code: 'not_implemented', message: ADAPTER_PROJECT_CREATE_UNAVAILABLE };
      }
      if (typeof formatEntry?.new === 'function') {
        formatEntry.new();
      } else if (typeof blockbench?.newProject === 'function') {
        blockbench.newProject(resolvedId);
      } else if (typeof modelFormat?.new === 'function') {
        modelFormat.new();
      }
      const dialogResult = tryAutoConfirmProjectDialog(name, options);
      if (!dialogResult.ok) return dialogResult.error;
      if (typeof blockbench?.setProjectName === 'function') {
        blockbench.setProjectName(name);
      } else if (blockbench?.project) {
        blockbench.project.name = name;
      }
      this.log.info('project created', { name, format: kind, formatId: resolvedId });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'project create failed');
      this.log.error('project create error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_create' });
    }
  }

  writeFile(path: string, contents: string): ToolError | null {
    try {
      const blockbench = readGlobals().Blockbench;
      if (!blockbench?.writeFile) {
        return { code: 'not_implemented', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE };
      }
      blockbench.writeFile(path, { content: contents, savetype: 'text' });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'write failed');
      this.log.error('write file error', { message });
      return { code: 'io_error', message };
    }
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    try {
      const globals = readGlobals();
      const project = globals.Project ?? globals.Blockbench?.project ?? null;
      const width = Number(project?.texture_width);
      const height = Number(project?.texture_height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
      }
      return { width, height };
    } catch (err) {
      return null;
    }
  }

  setProjectTextureResolution(width: number, height: number, modifyUv?: boolean): ToolError | null {
    try {
      const globals = readGlobals();
      const project = globals.Project ?? globals.Blockbench?.project ?? null;
      if (!project) {
        return { code: 'invalid_state', message: PROJECT_NO_ACTIVE };
      }
      const updateResolution = globals.updateProjectResolution;
      const normalizeUv = Boolean(modifyUv);
      if (typeof globals.setProjectResolution === 'function') {
        globals.setProjectResolution(width, height, normalizeUv);
        if (typeof updateResolution === 'function') updateResolution();
      } else {
        if (typeof project.setTextureSize === 'function') {
          project.setTextureSize(width, height);
        } else {
          project.texture_width = width;
          project.texture_height = height;
        }
        if (typeof updateResolution === 'function') updateResolution();
        if (normalizeUv) {
          this.log.warn('modifyUv requested but setProjectResolution is unavailable', { width, height });
        }
      }
      this.log.info('project texture resolution set', { width, height, modifyUv: normalizeUv });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'project texture resolution update failed');
      this.log.error('project texture resolution update error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_texture_resolution' });
    }
  }
}

const tryAutoConfirmProjectDialog = (
  projectName: string,
  options?: { dialog?: Record<string, unknown>; confirmDialog?: boolean }
): { ok: true } | { ok: false; error: ToolError } => {
  const dialogApi = readGlobals().Dialog;
  const dialog = dialogApi?.open;
  if (!dialog || typeof dialog.getFormResult !== 'function') {
    return { ok: true };
  }
  const current = dialog.getFormResult() ?? {};
  const allowed = new Set(Object.keys(current));
  const values: Record<string, unknown> = { ...current };
  if (options?.dialog) {
    for (const [key, value] of Object.entries(options.dialog)) {
      if (allowed.has(key)) values[key] = value;
    }
  }
  if (allowed.has('name') && !('name' in (options?.dialog ?? {}))) {
    values.name = projectName;
  } else if (allowed.has('project_name') && !('project_name' in (options?.dialog ?? {}))) {
    values.project_name = projectName;
  }
  if (typeof dialog.setFormValues === 'function') {
    dialog.setFormValues(values, true);
  }
  if (options?.confirmDialog !== false && typeof dialog.confirm === 'function') {
    dialog.confirm();
  }
  if (dialogApi?.open === dialog) {
    const remaining = dialog.getFormResult?.() ?? {};
    const missing = Object.entries(remaining)
      .filter(([, value]) => value === '' || value === null || value === undefined)
      .map(([key]) => key);
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        message: ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
        details: { fields: remaining, missing }
      }
    };
  }
  return { ok: true };
};
