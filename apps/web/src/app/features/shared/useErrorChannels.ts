import { useCallback, useMemo, useState } from 'react';

import type { UiErrorChannel } from '../../../lib/dashboardModel';
import { resolveGatewayRequestErrorMessage } from '../../../lib/gatewayApiClient';

type ErrorChannelState = Record<UiErrorChannel, string | null>;

const EMPTY_ERROR_CHANNEL_STATE: ErrorChannelState = {
  blocking: null,
  panel: null,
  inline: null
};

const normalizeMessage = (message: string | null | undefined): string | null => {
  if (typeof message !== 'string') {
    return null;
  }
  const normalized = message.trim();
  return normalized.length > 0 ? normalized : null;
};

const hasSameState = (left: ErrorChannelState, right: ErrorChannelState): boolean =>
  left.blocking === right.blocking && left.panel === right.panel && left.inline === right.inline;

export function useErrorChannels() {
  const [errors, setErrors] = useState<ErrorChannelState>(EMPTY_ERROR_CHANNEL_STATE);

  const setChannelError = useCallback((channel: UiErrorChannel, message: string | null | undefined) => {
    const normalized = normalizeMessage(message);
    setErrors((prev) => {
      if (prev[channel] === normalized) {
        return prev;
      }
      return {
        ...prev,
        [channel]: normalized
      };
    });
  }, []);

  const clearChannelError = useCallback((channel: UiErrorChannel) => {
    setErrors((prev) => {
      if (prev[channel] === null) {
        return prev;
      }
      return {
        ...prev,
        [channel]: null
      };
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors((prev) => {
      if (hasSameState(prev, EMPTY_ERROR_CHANNEL_STATE)) {
        return prev;
      }
      return EMPTY_ERROR_CHANNEL_STATE;
    });
  }, []);

  const reportError = useCallback(
    (error: unknown, fallbackMessage: string, channel: UiErrorChannel = 'panel') => {
      setChannelError(channel, resolveGatewayRequestErrorMessage(error, fallbackMessage));
    },
    [setChannelError]
  );

  const primaryError = useMemo(() => errors.blocking ?? errors.panel ?? errors.inline, [errors]);

  return {
    errors,
    blockingError: errors.blocking,
    panelError: errors.panel,
    inlineError: errors.inline,
    primaryError,
    setChannelError,
    clearChannelError,
    clearAllErrors,
    reportError
  };
}
