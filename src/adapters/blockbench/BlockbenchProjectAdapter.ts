import { FormatKind, ToolError } from '../../types';
import { errorMessage, Logger } from '../../logging';
import { hasUnsavedChanges, markProjectSaved, readGlobals } from './blockbenchUtils';
import { toolError } from '../../shared/tooling/toolResponse';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
  ADAPTER_PROJECT_CREATE_UNAVAILABLE,
  ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
  ADAPTER_PROJECT_CLOSE_UNAVAILABLE,
  ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES,
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
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
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
      const dialogResult = tryAutoConfirmProjectDialog(name, {
        ...options,
        formatId: resolvedId,
        formatKind: kind
      });
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

  closeProject(options?: { force?: boolean }): ToolError | null {
    try {
      const globals = readGlobals();
      const blockbench = globals.Blockbench;
      const project = globals.Project ?? blockbench?.project ?? null;
      if (!project) {
        return { code: 'invalid_state', message: PROJECT_NO_ACTIVE };
      }
      const hasUnsaved = hasUnsavedChanges(blockbench);
      if (hasUnsaved && !options?.force) {
        return { code: 'invalid_state', message: ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES };
      }
      const closeProject = project.close;
      if (typeof closeProject !== 'function') {
        return { code: 'not_implemented', message: ADAPTER_PROJECT_CLOSE_UNAVAILABLE };
      }
      const result = closeProject.call(project, Boolean(options?.force));
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).catch((err) => {
          const message = errorMessage(err, 'project close failed');
          this.log.error('project close error', { message });
        });
      }
      this.log.info('project closed', { force: Boolean(options?.force) });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'project close failed');
      this.log.error('project close error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_close' });
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
  options?: { dialog?: Record<string, unknown>; formatId?: string; formatKind?: FormatKind }
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
  if (allowed.has('format') && isEmptyDialogValue(values.format)) {
    const formatValue = coerceDialogSelectValue(current.format, options?.formatId, options?.formatKind);
    if (formatValue !== undefined) values.format = formatValue;
  }
  if (allowed.has('parent') && isEmptyDialogValue(values.parent) && options?.dialog?.parent !== undefined) {
    values.parent = options.dialog.parent;
  }
  if (typeof dialog.setFormValues === 'function') {
    dialog.setFormValues(values, true);
  }
  if (typeof dialog.confirm === 'function') dialog.confirm();
  if (dialogApi?.open === dialog) {
    const remaining = dialog.getFormResult?.() ?? {};
    const missing = getMissingFields(remaining);
    const fallbackValues = { ...values };
    let appliedFallback = false;
    if (missing.includes('format') && allowed.has('format') && options?.formatKind) {
      const fallbackFormat = coerceDialogSelectValue(current.format, undefined, options.formatKind);
      if (fallbackFormat !== undefined && !isSameDialogValue(fallbackValues.format, fallbackFormat)) {
        fallbackValues.format = fallbackFormat;
        appliedFallback = true;
      }
    }
    if (missing.includes('parent') && allowed.has('parent') && options?.dialog?.parent !== undefined) {
      if (!isSameDialogValue(fallbackValues.parent, options.dialog.parent)) {
        fallbackValues.parent = options.dialog.parent;
        appliedFallback = true;
      }
    }
    if (appliedFallback) {
      if (typeof dialog.setFormValues === 'function') {
        dialog.setFormValues(fallbackValues, true);
      }
      if (typeof dialog.confirm === 'function') dialog.confirm();
      if (dialogApi?.open !== dialog) {
        return { ok: true };
      }
    }
    const finalRemaining = dialog.getFormResult?.() ?? remaining;
    const finalMissing = getMissingFields(finalRemaining);
    const attemptedValues = appliedFallback ? fallbackValues : values;
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        message: ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
        fix: `Provide ensure_project.dialog values for: ${finalMissing.join(', ')}. Use the exact field keys.`,
        details: { fields: finalRemaining, missing: finalMissing, attempted: pickDialogFields(attemptedValues, finalMissing) }
      }
    };
  }
  return { ok: true };
};

const isEmptyDialogValue = (value: unknown): boolean =>
  value === '' || value === null || value === undefined;

const getMissingFields = (fields: Record<string, unknown>): string[] =>
  Object.entries(fields)
    .filter(([, value]) => isEmptyDialogValue(value))
    .map(([key]) => key);

const isSameDialogValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

const coerceDialogSelectValue = (
  currentValue: unknown,
  desiredId?: string,
  desiredLabel?: string
): unknown => {
  const desired = desiredId ?? desiredLabel;
  if (desired === undefined) return undefined;
  if (currentValue && typeof currentValue === 'object') {
    const record = { ...(currentValue as Record<string, unknown>) };
    if ('id' in record && desiredId) record.id = desiredId;
    if ('value' in record && desiredId) record.value = desiredId;
    if ('key' in record && desiredId) record.key = desiredId;
    if (desiredLabel) {
      if ('name' in record) record.name = desiredLabel;
      if ('label' in record) record.label = desiredLabel;
    }
    return record;
  }
  return desired;
};

const pickDialogFields = (values: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in values) picked[key] = values[key];
  });
  return picked;
};



