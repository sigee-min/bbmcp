import type { ToolError } from '@ashfox/contracts/types/internal';
import { errorMessage, type Logger } from '../../logging';
import { toolError } from '../../shared/tooling/toolResponse';

type AdapterErrorOptions = {
  context: string;
  fallbackMessage: string;
  logLabel?: string;
  code?: ToolError['code'];
  normalizeMessage?: boolean;
};

const buildAdapterError = (
  log: Logger,
  options: AdapterErrorOptions,
  err: unknown
): ToolError => {
  const message = errorMessage(err, options.fallbackMessage);
  log.error(options.logLabel ?? `${options.context} error`, { message });
  const details = {
    reason: 'adapter_exception',
    context: options.context
  };
  if (options.normalizeMessage === false) {
    return {
      code: options.code ?? 'unknown',
      message,
      details
    };
  }
  return toolError(options.code ?? 'unknown', message, {
    ...details
  });
};

export const withMappedAdapterError = <T>(
  log: Logger,
  options: AdapterErrorOptions,
  fn: () => T,
  onError: (error: ToolError) => T
): T => {
  try {
    return fn();
  } catch (err) {
    return onError(buildAdapterError(log, options, err));
  }
};

export const withToolErrorAdapterError = (
  log: Logger,
  context: string,
  fallbackMessage: string,
  fn: () => ToolError | null
): ToolError | null => {
  return withMappedAdapterError(log, { context, fallbackMessage }, fn, (error) => error);
};

export const withAdapterError = <T>(
  log: Logger,
  context: string,
  fallbackMessage: string,
  fn: () => T,
  onError: (error: ToolError) => T
): T => {
  return withMappedAdapterError(log, { context, fallbackMessage }, fn, onError);
};
