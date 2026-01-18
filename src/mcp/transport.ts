import { encodeSseComment } from './sse';
import { SseConnection } from './types';

type SseAdapter = {
  send: (payload: string) => void;
  close: () => void;
  onClose: (handler: () => void) => void;
};

export const openSseConnection = (
  adapter: SseAdapter,
  onOpen?: (conn: SseConnection) => void | (() => void)
): SseConnection => {
  let closed = false;
  const keepAliveMs = 15_000;
  let cleanup: void | (() => void);

  const connection: SseConnection = {
    send: (payload) => {
      if (closed) return;
      adapter.send(payload);
    },
    close: () => {
      if (closed) return;
      closed = true;
      if (cleanup) cleanup();
      clearInterval(timer);
      adapter.close();
    },
    isClosed: () => closed
  };

  if (onOpen) {
    cleanup = onOpen(connection);
  }

  const timer = setInterval(() => {
    if (closed) return;
    adapter.send(encodeSseComment('keepalive'));
  }, keepAliveMs);

  adapter.onClose(() => connection.close());
  return connection;
};
