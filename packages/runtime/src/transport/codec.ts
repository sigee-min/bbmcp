import { isSidecarMessage, SidecarMessage } from './protocol';

const DEFAULT_MAX_BUFFER = 5_000_000;

const decodeChunk = (chunk: string | Uint8Array): string => {
  if (typeof chunk === 'string') return chunk;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(chunk);
  }
  return String(chunk);
};

export type LineDecoder = {
  push: (chunk: string | Uint8Array) => void;
  end: () => void;
};

export const encodeMessage = (message: SidecarMessage): string => `${JSON.stringify(message)}\n`;

export const createLineDecoder = (
  onMessage: (message: SidecarMessage) => void,
  onError?: (err: Error) => void,
  maxBuffer = DEFAULT_MAX_BUFFER
): LineDecoder => {
  let buffer = '';

  const push = (chunk: string | Uint8Array) => {
    buffer += decodeChunk(chunk);
    if (buffer.length > maxBuffer) {
      buffer = '';
      onError?.(new Error('sidecar ipc buffer overflow'));
      return;
    }
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as unknown;
          if (!isSidecarMessage(parsed)) {
            onError?.(new Error('sidecar ipc invalid message'));
            continue;
          }
          onMessage(parsed);
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error('sidecar ipc parse error'));
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  };

  const end = () => {
    buffer = '';
  };

  return { push, end };
};


