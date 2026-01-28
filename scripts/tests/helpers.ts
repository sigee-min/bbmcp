import type { Logger } from '../../src/logging';
import type { DomPort } from '../../src/ports/dom';
import type { ProxyPipelineDeps } from '../../src/proxy/types';
import type { Limits, ToolError } from '../../src/types';
import { DEFAULT_UV_POLICY } from '../../src/domain/uvPolicy';

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

export const createMockDom = (options: MockContextOptions = {}) => ({
  createCanvas: () => createMockCanvas(options),
  createImage: () => null
});

export const asDomPort = (dom: { createCanvas: () => unknown; createImage: () => unknown }): DomPort =>
  dom as DomPort;

export const asProxyService = (
  service: Partial<ProxyPipelineDeps['service']>
): ProxyPipelineDeps['service'] => service as ProxyPipelineDeps['service'];

export const makeProxyDeps = (
  overrides: Partial<ProxyPipelineDeps> & {
    service?: Partial<ProxyPipelineDeps['service']>;
    dom?: Partial<DomPort>;
    log?: Partial<Logger>;
  } = {}
): ProxyPipelineDeps => {
  const baseDom: DomPort = asDomPort({ createCanvas: () => null, createImage: () => null });
  const defaultService = {
    getProjectState: (_payload: unknown) =>
      ok({
        project: {
          id: 'p0',
          active: true,
          name: null,
          format: null,
          revision: 'r0',
          counts: { bones: 0, cubes: 0, textures: 0, animations: 0 }
        }
      }),
    getProjectDiff: (_payload: unknown) =>
      ok({
        diff: {
          sinceRevision: 'r0',
          currentRevision: 'r0',
          counts: {
            bones: { added: 0, removed: 0, changed: 0 },
            cubes: { added: 0, removed: 0, changed: 0 },
            textures: { added: 0, removed: 0, changed: 0 },
            animations: { added: 0, removed: 0, changed: 0 }
          }
        }
      }),
    getUvPolicy: () => DEFAULT_UV_POLICY
  };
  return {
    service: asProxyService({ ...defaultService, ...(overrides.service ?? {}) }),
    dom: { ...baseDom, ...(overrides.dom ?? {}) } as DomPort,
    log: { ...noopLog, ...(overrides.log ?? {}) },
    limits: overrides.limits ?? DEFAULT_LIMITS,
    includeStateByDefault: overrides.includeStateByDefault ?? (() => false),
    includeDiffByDefault: overrides.includeDiffByDefault ?? (() => false),
    runWithoutRevisionGuard: overrides.runWithoutRevisionGuard ?? (async (fn) => await fn()),
    cache: overrides.cache
  };
};

export const unsafePayload = <T>(value: unknown): T => value as T;
