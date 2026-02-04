import type { Logger } from '../../src/logging';
import type { Limits, ToolError } from '../../src/types';
import { DEFAULT_UV_POLICY } from '../../src/domain/uv/policy';

export type UsecaseResult<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export const ok = <T>(value: T): UsecaseResult<T> => ({ ok: true, value });
export const fail = (error: ToolError): UsecaseResult<never> => ({ ok: false, error });

export const DEFAULT_LIMITS: Limits = {
  maxCubes: 2048,
  maxTextureSize: 256,
  maxAnimationSeconds: 120
};

export const noopLog: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export const registerAsync = (promise: Promise<unknown>) => {
  const g = globalThis as { __bbmcp_test_promises?: Promise<unknown>[] };
  if (!Array.isArray(g.__bbmcp_test_promises)) g.__bbmcp_test_promises = [];
  g.__bbmcp_test_promises.push(promise);
};

type MockContextOptions = {
  pattern?: unknown | null;
  opaqueFirstPixel?: boolean;
};

const createImageData = (width: number, height: number, opaqueFirstPixel: boolean) => {
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));
  if (opaqueFirstPixel && data.length >= 4) data[3] = 255;
  return { data };
};

export const createMockContext = (options: MockContextOptions = {}) => ({
  imageSmoothingEnabled: false,
  fillStyle: undefined as unknown,
  strokeStyle: undefined as unknown,
  lineWidth: 1,
  fillRect: () => undefined,
  strokeRect: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  stroke: () => undefined,
  drawImage: () => undefined,
  save: () => undefined,
  restore: () => undefined,
  rect: () => undefined,
  clip: () => undefined,
  translate: () => undefined,
  createPattern: () => (options.pattern === undefined ? ({}) : options.pattern),
  getImageData: (_x: number, _y: number, w: number, h: number) =>
    createImageData(w, h, options.opaqueFirstPixel ?? true)
});

export const createMockCanvas = (options: MockContextOptions = {}) => {
  const ctx = createMockContext(options);
  return {
    width: 0,
    height: 0,
    getContext: (type: string) => (type === '2d' ? ctx : null),
    toDataURL: () => 'data:image/png;base64,'
  };
};

export const unsafePayload = <T>(value: unknown): T => value as T;


