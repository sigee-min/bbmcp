import { Logger } from '../../logging';
import { createLineDecoder, encodeMessage } from '../../transport/codec';
import {
  PROTOCOL_VERSION,
  SidecarMessage,
  SidecarRequestMessage,
  SidecarResponseMessage
} from '../../transport/protocol';
import { ToolError, ToolResponse, ToolName } from '../../types';
import type { ProxyTool } from '../../spec';

type Readable = {
  on(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
};

type Writable = {
  write: (data: string) => void;
};

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
  private readonly readable: Readable;
  private readonly writable: Writable;
  private readonly log: Logger;
  private readonly timeoutMs: number;
  private readonly maxInFlight: number;
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private ready = false;
  private protocolVersion: number | null = null;

  constructor(readable: Readable, writable: Writable, log: Logger, options: ClientOptions = {}) {
    this.readable = readable;
    this.writable = writable;
    this.log = log;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;

    const decoder = createLineDecoder(
      (message) => this.handleMessage(message),
      (err) => this.log.error('sidecar ipc decode error', { message: err.message })
    );
    this.readable.on('data', (chunk: string | Uint8Array) => decoder.push(chunk));
    this.readable.on('error', (err: Error) => {
      const messageText = err instanceof Error ? err.message : String(err);
      this.log.error('sidecar ipc stream error', { message: messageText });
    });
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

  request(tool: ToolName | ProxyTool, payload: unknown, mode?: 'direct' | 'proxy'): Promise<ToolResponse<unknown>> {
    if (!this.canAccept()) {
      return Promise.resolve({
        ok: false,
        error: { code: 'invalid_state', message: 'too many in-flight requests' }
      });
    }

    const id = this.nextId();
    const message: SidecarRequestMessage = {
      type: 'request',
      id,
      ts: Date.now(),
      mode,
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
    try {
      this.writable.write(encodeMessage(message));
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      this.log.error('sidecar ipc send failed', { message: messageText });
    }
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
      pending.resolve({ ok: true, data: message.data });
      return;
    }
    const error: ToolError = message.error ?? { code: 'unknown', message: 'sidecar error' };
    pending.resolve({ ok: false, error });
  }
}
