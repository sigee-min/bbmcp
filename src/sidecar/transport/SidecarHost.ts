import { Dispatcher, ToolName, ToolPayloadMap, ToolResponse } from '../../types';
import { ProxyRouter } from '../../proxy';
import { Logger } from '../../logging';
import { createLineDecoder, encodeMessage } from '../../transport/codec';
import {
  PROTOCOL_VERSION,
  SidecarMessage,
  SidecarRequestMessage,
  SidecarResponseMessage
} from '../../transport/protocol';
import { ProxyTool } from '../../spec';

type Readable = {
  on(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: 'end', handler: () => void): void;
  removeListener?(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
};

type Writable = {
  write: (data: string) => void;
};

type DispatcherToolName = ToolName;
type DispatcherPayload = ToolPayloadMap[ToolName];

export class SidecarHost {
  private readonly readable: Readable;
  private readonly writable: Writable;
  private readonly dispatcher: Dispatcher;
  private readonly proxy: ProxyRouter;
  private readonly log: Logger;
  private readonly decoder;
  private readonly onData: (chunk: string | Uint8Array) => void;

  constructor(readable: Readable, writable: Writable, dispatcher: Dispatcher, proxy: ProxyRouter, log: Logger) {
    this.readable = readable;
    this.writable = writable;
    this.dispatcher = dispatcher;
    this.proxy = proxy;
    this.log = log;
    this.decoder = createLineDecoder(
      (message) => this.handleMessage(message),
      (err) => this.log.error('sidecar ipc decode error', { message: err.message })
    );
    this.onData = (chunk: string | Uint8Array) => this.decoder.push(chunk);

    this.readable.on('data', this.onData);
    this.readable.on('error', (err: Error) => {
      const messageText = err instanceof Error ? err.message : String(err);
      this.log.error('sidecar ipc stream error', { message: messageText });
    });
    this.readable.on('end', () => this.log.warn('sidecar ipc stream ended'));
  }

  send(message: SidecarMessage) {
    try {
      this.writable.write(encodeMessage(message));
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      this.log.error('sidecar ipc send failed', { message: messageText });
    }
  }

  dispose() {
    if (this.readable.removeListener) {
      this.readable.removeListener('data', this.onData);
    }
  }

  private handleMessage(message: SidecarMessage) {
    if (message.type === 'hello') {
      this.send({ type: 'ready', version: PROTOCOL_VERSION, ts: Date.now() });
      return;
    }
    if (message.type !== 'request') return;
    this.handleRequest(message);
  }

  private handleRequest(message: SidecarRequestMessage) {
    if (!message.id) {
      this.log.warn('sidecar request missing id');
      return;
    }
    const mode = message.mode === 'proxy' ? 'proxy' : 'direct';
    let result: ToolResponse<unknown>;
    try {
      result =
        mode === 'proxy'
          ? this.proxy.handle(message.tool as ProxyTool, message.payload)
          : this.dispatcher.handle(message.tool as DispatcherToolName, message.payload as DispatcherPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'handler error';
      const response: SidecarResponseMessage = {
        type: 'response',
        id: message.id,
        ts: Date.now(),
        ok: false,
        error: { code: 'unknown', message: msg }
      };
      this.send(response);
      return;
    }

    const response: SidecarResponseMessage = {
      type: 'response',
      id: message.id,
      ts: Date.now(),
      ok: result.ok,
      data: result.ok ? result.data : undefined,
      error: result.ok ? undefined : result.error
    };
    this.send(response);
  }
}
