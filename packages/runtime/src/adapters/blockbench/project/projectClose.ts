import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { hasUnsavedChanges, readGlobals } from '../blockbenchUtils';
import { withMappedAdapterError } from '../adapterErrors';
import {
  ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED,
  ADAPTER_PROJECT_CLOSE_UNAVAILABLE,
  ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES,
  PROJECT_NO_ACTIVE
} from '../../../shared/messages';

export const runCloseProject = (log: Logger, options?: { force?: boolean }): ToolError | null => {
  return withMappedAdapterError<ToolError | null>(
    log,
    {
      context: 'project_close',
      fallbackMessage: 'project close failed',
      logLabel: 'project close error'
    },
    () => {
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
        return { code: 'invalid_state', message: ADAPTER_PROJECT_CLOSE_UNAVAILABLE };
      }
      const result = closeProject.call(project, Boolean(options?.force));
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return { code: 'invalid_state', message: ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED };
      }
      log.info('project closed', { force: Boolean(options?.force) });
      return null;
    },
    (error) => error
  );
};
