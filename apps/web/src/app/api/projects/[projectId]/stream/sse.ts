export const EVENT_POLL_MS = 1200;
export const KEEPALIVE_MS = 15000;

const encoder = new TextEncoder();

export const encodeSseChunk = (value: string): Uint8Array => encoder.encode(value);

export const toIntegerOrNull = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeLastEventId = (value: number | null): number => {
  if (value === null || Number.isNaN(value)) {
    return -1;
  }
  return value < -1 ? -1 : value;
};

export const formatSseMessage = (eventName: string, eventId: number, data: unknown): string =>
  `id: ${eventId}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

export const streamResponseHeaders = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no'
} as const;
