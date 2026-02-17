import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { hasUnsavedChanges, markProjectSaved, readGlobals } from '../blockbenchUtils';
import { tryAutoConfirmProjectDialog } from '../projectDialogHelpers';
import { withMappedAdapterError } from '../adapterErrors';
import { ADAPTER_PROJECT_CREATE_UNAVAILABLE, ADAPTER_PROJECT_UNSAVED_CHANGES } from '../../../shared/messages';

export const runCreateProject = (
  log: Logger,
  name: string,
  formatId: string,
  options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
): ToolError | null => {
  return withMappedAdapterError(
    log,
    {
      context: 'project_create',
      fallbackMessage: 'project create failed',
      logLabel: 'project create error'
    },
    () => {
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
          log.warn('auto-discarding unsaved changes for project creation', { name });
        } else {
          log.warn('discarding unsaved changes for project creation', { name });
        }
        markProjectSaved(blockbench);
      }
      const formatEntry = formats?.[resolvedId];
      const canCreate =
        typeof formatEntry?.new === 'function' ||
        typeof blockbench?.newProject === 'function' ||
        typeof modelFormat?.new === 'function';
      if (!canCreate) {
        return { code: 'invalid_state', message: ADAPTER_PROJECT_CREATE_UNAVAILABLE };
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
        formatId: resolvedId
      });
      if (!dialogResult.ok) return dialogResult.error;
      if (typeof blockbench?.setProjectName === 'function') {
        blockbench.setProjectName(name);
      } else if (blockbench?.project) {
        blockbench.project.name = name;
      }
      log.info('project created', { name, formatId: resolvedId });
      return null;
    },
    (error) => error
  );
};
