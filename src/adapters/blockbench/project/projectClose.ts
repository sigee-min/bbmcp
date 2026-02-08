import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import { hasUnsavedChanges, readGlobals } from '../blockbenchUtils';
import { toolError } from '../../../shared/tooling/toolResponse';
import {
  ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED,
  ADAPTER_PROJECT_CLOSE_UNAVAILABLE,
  ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES,
  PROJECT_NO_ACTIVE
} from '../../../shared/messages';

export const runCloseProject = (log: Logger, options?: { force?: boolean }): ToolError | null => {
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
      return { code: 'not_implemented', message: ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED };
    }
    log.info('project closed', { force: Boolean(options?.force) });
    return null;
  } catch (err) {
    const message = errorMessage(err, 'project close failed');
    log.error('project close error', { message });
    return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_close' });
  }
};

