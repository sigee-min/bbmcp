import { FormatKind, ToolError } from '../../types';
import { Logger } from '../../logging';
import { hasUnsavedChanges, markProjectSaved, readGlobals } from './blockbenchUtils';

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
            message: 'Project has unsaved changes. Save or close it before creating a new project.'
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
        return { code: 'not_implemented', message: 'Blockbench project creation unavailable' };
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
      const message = err instanceof Error ? err.message : 'project create failed';
      this.log.error('project create error', { message });
      return { code: 'unknown', message };
    }
  }

  writeFile(path: string, contents: string): ToolError | null {
    try {
      const blockbench = readGlobals().Blockbench;
      if (!blockbench?.writeFile) {
        return { code: 'not_implemented', message: 'Blockbench.writeFile not available' };
      }
      blockbench.writeFile(path, { content: contents, savetype: 'text' });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'write failed';
      this.log.error('write file error', { message });
      return { code: 'io_error', message };
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
        message: 'Project dialog requires input. Provide create_project.dialog values and set confirmDialog=true.',
        details: { fields: remaining, missing }
      }
    };
  }
  return { ok: true };
};
