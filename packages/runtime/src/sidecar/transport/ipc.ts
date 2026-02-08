import { errorMessage, Logger } from '../../logging';
import { createLineDecoder, encodeMessage } from '../../transport/codec';
import type { SidecarMessage } from '../../transport/protocol';

export type IpcReadable = {
  on(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: 'end', handler: () => void): void;
  removeListener?(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
};

export type IpcWritable = {
  write: (data: string) => void;
};

export const createIpcDecoder = (log: Logger, onMessage: (message: SidecarMessage) => void) => {
  const decoder = createLineDecoder(onMessage, (err) =>
    log.error('sidecar ipc decode error', { message: err.message })
  );
  const onData = (chunk: string | Uint8Array) => decoder.push(chunk);
  return { decoder, onData };
};

export const attachIpcReadable = (
  readable: IpcReadable,
  onData: (chunk: string | Uint8Array) => void,
  log: Logger,
  options?: { onEnd?: () => void }
) => {
  readable.on('data', onData);
  readable.on('error', (err: Error) => {
    log.error('sidecar ipc stream error', { message: errorMessage(err) });
  });
  if (options?.onEnd) {
    readable.on('end', options.onEnd);
  }
};

export const detachIpcReadable = (readable: IpcReadable, onData: (chunk: string | Uint8Array) => void) => {
  if (readable.removeListener) {
    readable.removeListener('data', onData);
  }
};

export const sendIpcMessage = (writable: IpcWritable, message: SidecarMessage, log: Logger) => {
  try {
    writable.write(encodeMessage(message));
  } catch (err) {
    log.error('sidecar ipc send failed', { message: errorMessage(err) });
  }
};


