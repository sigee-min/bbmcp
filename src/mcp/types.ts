export type JsonSchema = {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  description?: string;
  title?: string;
  examples?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: ReadonlyArray<string | number | boolean | null>;
  additionalProperties?: boolean;
  minProperties?: number;
  minItems?: number;
  maxItems?: number;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description?: string;
  inputSchema: JsonSchema;
};

export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type SseConnection = {
  send: (payload: string) => void;
  close: () => void;
  isClosed: () => boolean;
};

export type ResponsePlan =
  | {
      kind: 'json';
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  | {
      kind: 'sse';
      status: number;
      headers: Record<string, string>;
      events: string[];
      close: boolean;
      onOpen?: (conn: SseConnection) => void | (() => void);
    }
  | {
      kind: 'empty';
      status: number;
      headers: Record<string, string>;
    }
  | {
      kind: 'binary';
      status: number;
      headers: Record<string, string>;
      body: Uint8Array;
    };

export type JsonRpcMessage = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number | null;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpServerConfig = {
  path: string;
  token?: string;
  serverInfo?: { name: string; version: string };
  instructions?: string;
  supportedProtocols?: string[];
  sessionTtlMs?: number;
};
