import type { NativeJob } from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';

import { API_CORS_HEADERS } from './constants';

export const DEFAULT_TENANT_ID = 'default-tenant';
export const EXPORT_BUCKET = 'exports';

export type PreviewStatus = 'ready' | 'processing' | 'empty' | 'error';

export type ParsedPositiveInt =
  | {
      ok: true;
      value?: number;
    }
  | {
      ok: false;
    };

export const STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no'
} as const;

export const jsonPlan = (status: number, payload: unknown, headers: Record<string, string> = {}): ResponsePlan => ({
  kind: 'json',
  status,
  headers: {
    ...API_CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    ...headers
  },
  body: JSON.stringify(payload)
});

export const parseOptionalPositiveInt = (value: unknown): ParsedPositiveInt => {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
  if (!Number.isInteger(value) || value <= 0) return { ok: false };
  return { ok: true, value };
};

export const normalizeOptionalFolderId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const parseLastEventId = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value) && value.length > 0) {
    return parseLastEventId(value[0]);
  }
  return null;
};

export const normalizeLastEventId = (value: number | null): number => {
  if (value === null || Number.isNaN(value)) {
    return -1;
  }
  return value < -1 ? -1 : value;
};

export const formatSseMessage = (eventName: string, eventId: number, data: unknown): string =>
  `id: ${eventId}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

const sanitizeBlobPath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');

export const buildExportKey = (projectId: string, exportPath: string): string =>
  `${DEFAULT_TENANT_ID}/${projectId}/${sanitizeBlobPath(exportPath) || 'export.json'}`;

export const readExportPath = (job: NativeJob): string | null => {
  if (job.kind !== 'gltf.convert' || job.status !== 'completed') {
    return null;
  }
  const output = job.result?.output;
  if (!output || typeof output !== 'object') {
    return null;
  }
  const exportPath = (output as Record<string, unknown>).exportPath;
  if (typeof exportPath !== 'string' || exportPath.trim().length === 0) {
    return null;
  }
  return exportPath;
};

const isPreviewCompatibleGltfJob = (job: NativeJob): boolean => {
  if (job.kind !== 'gltf.convert' || job.status !== 'completed') {
    return false;
  }

  const output = job.result?.output;
  if (!output || typeof output !== 'object') {
    // Legacy records may not include output metadata. Keep compatibility.
    return true;
  }

  const outputRecord = output as Record<string, unknown>;
  const selectedFormat = outputRecord.selectedFormat;
  const requestedCodecId = outputRecord.requestedCodecId;

  if (typeof selectedFormat === 'string' && selectedFormat !== 'gltf') {
    return false;
  }
  if (typeof requestedCodecId === 'string' && requestedCodecId !== 'gltf') {
    return false;
  }

  return true;
};

export const latestCompletedGltfJob = (jobs: readonly NativeJob[]): NativeJob | null => {
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (!isPreviewCompatibleGltfJob(job)) continue;
    if (readExportPath(job)) return job;
  }
  return null;
};

export const hasPendingGltfJob = (jobs: readonly NativeJob[]): boolean =>
  jobs.some((job) => job.kind === 'gltf.convert' && (job.status === 'queued' || job.status === 'running'));

export const decodePreviewGltf = (bytes: Uint8Array): string | null => {
  const text = Buffer.from(bytes).toString('utf8');
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const asset = parsed.asset;
    if (!asset || typeof asset !== 'object') {
      return null;
    }
    return text;
  } catch {
    return null;
  }
};

export const previewJsonPlan = (
  status: PreviewStatus,
  extras: Record<string, unknown> = {},
  statusCode = 200
): ResponsePlan =>
  jsonPlan(statusCode, {
    ok: status !== 'error',
    status,
    ...extras
  });

export const invalidPayloadPlan = (message: string): ResponsePlan =>
  jsonPlan(400, {
    ok: false,
    code: 'invalid_payload',
    message
  });

export const notFoundPlan = (resource: 'Project' | 'Folder', id: string): ResponsePlan =>
  jsonPlan(404, {
    ok: false,
    code: 'project_load_failed',
    message: `${resource} not found: ${id}`
  });
