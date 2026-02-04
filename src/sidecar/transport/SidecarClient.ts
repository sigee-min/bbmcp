import { Logger } from '../../logging';
import {
  PROTOCOL_VERSION,
  SidecarMessage,
  SidecarRequestMessage,
  SidecarResponseMessage
} from '../../transport/protocol';
import { ToolError, ToolResponse, ToolName } from '../../types';
import { toolError } from '../../shared/tooling/toolResponse';
import { normalizeToolResponse } from '../../shared/tooling/toolResponseGuard';
import { SIDECAR_INFLIGHT_LIMIT_REACHED, SIDECAR_TOOL_ERROR } from '../../shared/messages';
import { attachIpcReadable, createIpcDecoder, IpcReadable, IpcWritable, sendIpcMessage } from './ipc';

type Pending = {
  resolve: (value: ToolResponse<unknown>) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ClientOptions = {
  timeoutMs?: number;
  maxInFlight?: number;
};

export type SidecarClientStatus = {
  ready: boolean;
  inFlight: number;
  maxInFlight: number;
  protocolVersion: number | null;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_IN_FLIGHT = 64;

export class SidecarClient {
  private readonly readable: IpcReadable;
  private readonly writable: IpcWritable;
  private readonly log: Logger;
  private readonly timeoutMs: number;
  private readonly maxInFlight: number;
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private ready = false;
  private protocolVersion: number | null = null;

  constructor(readable: IpcReadable, writable: IpcWritable, log: Logger, options: ClientOptions = {}) {
    this.readable = readable;
    this.writable = writable;
    this.log = log;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;

    const { onData } = createIpcDecoder(this.log, (message) => this.handleMessage(message));
    attachIpcReadable(this.readable, onData, this.log);
  }

  start() {
    this.ready = false;
    this.protocolVersion = null;
    this.send({ type: 'hello', version: PROTOCOL_VERSION, role: 'sidecar', ts: Date.now() });
  }

  canAccept(): boolean {
    return this.pending.size < this.maxInFlight;
  }

  getStatus(): SidecarClientStatus {
    return {
      ready: this.ready,
      inFlight: this.pending.size,
      maxInFlight: this.maxInFlight,
      protocolVersion: this.protocolVersion
    };
  }

  request(tool: ToolName, payload: unknown): Promise<ToolResponse<unknown>> {
    if (!this.canAccept()) {
      return Promise.resolve({
        ok: false,
        error: { code: 'invalid_state', message: SIDECAR_INFLIGHT_LIMIT_REACHED }
      });
    }

    const id = this.nextId();
    const message: SidecarRequestMessage = {
      type: 'request',
      id,
      ts: Date.now(),
      tool,
      payload
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('sidecar request timeout'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeoutId });
      this.send(message);
    });
  }

  private nextId(): string {
    this.counter += 1;
    return `${Date.now()}_${this.counter}`;
  }

  private send(message: SidecarMessage) {
    sendIpcMessage(this.writable, message, this.log);
  }

  private handleMessage(message: SidecarMessage) {
    if (message.type === 'ready') {
      this.ready = true;
      this.protocolVersion = message.version ?? null;
      this.log.info('sidecar ipc ready', { version: message.version });
      return;
    }
    if (message.type === 'response') {
      this.resolveResponse(message);
      return;
    }
    if (message.type === 'error') {
      this.log.warn('sidecar ipc error', { message: message.message });
      return;
    }
  }

  private resolveResponse(message: SidecarResponseMessage) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.pending.delete(message.id);

    if (message.ok) {
      const response = {
        ok: true,
        data: message.data,
        ...(message.content ? { content: message.content } : {}),
        ...(message.structuredContent !== undefined ? { structuredContent: message.structuredContent } : {}),
        ...(message.nextActions ? { nextActions: message.nextActions } : {})
      };
      pending.resolve(normalizeToolResponse(response, { source: 'sidecar_client', ensureReason: true }));
      return;
    }
    const error: ToolError =
      message.error ?? toolError('unknown', SIDECAR_TOOL_ERROR, { reason: 'sidecar_missing_error' });
    const response = {
      ok: false,
      error,
      ...(message.content ? { content: message.content } : {}),
      ...(message.structuredContent !== undefined ? { structuredContent: message.structuredContent } : {}),
      ...(message.nextActions ? { nextActions: message.nextActions } : {})
    };
    pending.resolve(normalizeToolResponse(response, { source: 'sidecar_client', ensureReason: true }));
  }
}



