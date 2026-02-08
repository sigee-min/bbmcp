import { Dispatcher, ToolName, ToolPayloadMap, ToolResponse } from '@ashfox/contracts/types/internal';
import { errorMessage, Logger } from '../../logging';
import {
  PROTOCOL_VERSION,
  SidecarMessage,
  SidecarRequestMessage,
  SidecarResponseMessage
} from '../../transport/protocol';
import { toolError } from '../../shared/tooling/toolResponse';
import { attachIpcReadable, createIpcDecoder, detachIpcReadable, IpcReadable, IpcWritable, sendIpcMessage } from './ipc';

type DispatcherToolName = ToolName;
type DispatcherPayload = ToolPayloadMap[ToolName];

export class SidecarHost {
  private readonly readable: IpcReadable;
  private readonly writable: IpcWritable;
  private readonly dispatcher: Dispatcher;
  private readonly log: Logger;
  private readonly onData: (chunk: string | Uint8Array) => void;

  constructor(readable: IpcReadable, writable: IpcWritable, dispatcher: Dispatcher, log: Logger) {
    this.readable = readable;
    this.writable = writable;
    this.dispatcher = dispatcher;
    this.log = log;
    const { onData } = createIpcDecoder(this.log, (message) => this.handleMessage(message));
    this.onData = onData;

    attachIpcReadable(this.readable, this.onData, this.log, {
      onEnd: () => this.log.warn('sidecar ipc stream ended')
    });
  }

  send(message: SidecarMessage) {
    sendIpcMessage(this.writable, message, this.log);
  }

  dispose() {
    detachIpcReadable(this.readable, this.onData);
  }

  private handleMessage(message: SidecarMessage) {
    if (message.type === 'hello') {
      this.send({ type: 'ready', version: PROTOCOL_VERSION, ts: Date.now() });
      return;
    }
    if (message.type !== 'request') return;
    void this.handleRequest(message);
  }

  private async handleRequest(message: SidecarRequestMessage) {
    if (!message.id) {
      this.log.warn('sidecar request missing id');
      return;
    }
    let result: ToolResponse<unknown>;
    try {
      result = await this.dispatcher.handle(message.tool as DispatcherToolName, message.payload as DispatcherPayload);
    } catch (err) {
      const msg = errorMessage(err, 'handler error');
      const response: SidecarResponseMessage = {
        type: 'response',
        id: message.id,
        ts: Date.now(),
        ok: false,
        error: toolError('unknown', msg, {
          reason: 'sidecar_handler_exception',
          tool: message.tool
        })
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
      error: result.ok ? undefined : result.error,
      content: result.content,
      structuredContent: result.structuredContent,
      nextActions: result.nextActions
    };
    this.send(response);
  }
}




