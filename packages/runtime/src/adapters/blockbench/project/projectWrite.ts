import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { readGlobals } from '../blockbenchUtils';
import { withMappedAdapterError } from '../adapterErrors';
import { ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE } from '../../../shared/messages';

export const runWriteFile = (log: Logger, path: string, contents: string): ToolError | null => {
  return withMappedAdapterError<ToolError | null>(
    log,
    {
      context: 'project_write',
      fallbackMessage: 'write failed',
      logLabel: 'write file error',
      normalizeMessage: false
    },
    () => {
      const blockbench = readGlobals().Blockbench;
      if (!blockbench?.writeFile) {
        return { code: 'invalid_state', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE };
      }
      blockbench.writeFile(path, { content: contents, savetype: 'text' });
      return null;
    },
    (error) => ({ code: 'io_error', message: error.message })
  );
};
