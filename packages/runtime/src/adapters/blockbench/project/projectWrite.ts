import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import { readGlobals } from '../blockbenchUtils';
import { ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE } from '../../../shared/messages';

export const runWriteFile = (log: Logger, path: string, contents: string): ToolError | null => {
  try {
    const blockbench = readGlobals().Blockbench;
    if (!blockbench?.writeFile) {
      return { code: 'not_implemented', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE };
    }
    blockbench.writeFile(path, { content: contents, savetype: 'text' });
    return null;
  } catch (err) {
    const message = errorMessage(err, 'write failed');
    log.error('write file error', { message });
    return { code: 'io_error', message };
  }
};

