import type { ToolError } from '@ashfox/contracts/types/internal';
import { errorMessage, type Logger } from '../../logging';
import { toolError } from '../../shared/tooling/toolResponse';

export const withToolErrorAdapterError = (
  log: Logger,
  context: string,
  fallbackMessage: string,
  fn: () => ToolError | null
): ToolError | null => {
  try {
    return fn();
  } catch (err) {
    const message = errorMessage(err, fallbackMessage);
    log.error(`${context} error`, { message });
    return toolError('unknown', message, { reason: 'adapter_exception', context });
  }
};

export const withAdapterError = <T>(
  log: Logger,
  context: string,
  fallbackMessage: string,
  fn: () => T,
  onError: (error: ToolError) => T
): T => {
  try {
    return fn();
  } catch (err) {
    const message = errorMessage(err, fallbackMessage);
    log.error(`${context} error`, { message });
    return onError(toolError('unknown', message, { reason: 'adapter_exception', context }));
  }
};




