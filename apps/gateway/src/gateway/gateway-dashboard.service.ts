import { Injectable } from '@nestjs/common';
import {
  NativeJobContractError,
  normalizeNativeJobPayload,
  normalizeSupportedNativeJobKind,
  type NativeJob,
  type NativeProjectSnapshot,
  type SupportedNativeJobKind
} from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { API_CORS_HEADERS } from './constants';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import type { StreamQueryDto } from './dto/stream-query.dto';
import type { SubmitJobDto } from './dto/submit-job.dto';
import { GatewayRuntimeService } from './gateway-runtime.service';

const DEFAULT_TENANT_ID = 'default-tenant';
const EXPORT_BUCKET = 'exports';
const EVENT_POLL_MS = 1200;
const KEEPALIVE_MS = 15000;

type PreviewStatus = 'ready' | 'processing' | 'empty' | 'error';

type ParsedPositiveInt =
  | {
      ok: true;
      value?: number;
    }
  | {
      ok: false;
    };

const STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no'
} as const;

const jsonPlan = (status: number, payload: unknown, headers: Record<string, string> = {}): ResponsePlan => ({
  kind: 'json',
  status,
  headers: {
    ...API_CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    ...headers
  },
  body: JSON.stringify(payload)
});

const parseOptionalPositiveInt = (value: unknown): ParsedPositiveInt => {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
  if (!Number.isInteger(value) || value <= 0) return { ok: false };
  return { ok: true, value };
};

const parseLastEventId = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value) && value.length > 0) {
    return parseLastEventId(value[0]);
  }
  return null;
};

const normalizeLastEventId = (value: number | null): number => {
  if (value === null || Number.isNaN(value)) {
    return -1;
  }
  return value < -1 ? -1 : value;
};

const formatSseMessage = (eventName: string, eventId: number, data: unknown): string =>
  `id: ${eventId}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

const sanitizeBlobPath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');

const buildExportKey = (projectId: string, exportPath: string): string =>
  `${DEFAULT_TENANT_ID}/${projectId}/${sanitizeBlobPath(exportPath) || 'export.json'}`;

const readExportPath = (job: NativeJob): string | null => {
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

const latestCompletedGltfJob = (jobs: readonly NativeJob[]): NativeJob | null => {
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (job.kind !== 'gltf.convert') continue;
    if (job.status === 'completed' && readExportPath(job)) return job;
  }
  return null;
};

const hasPendingGltfJob = (jobs: readonly NativeJob[]): boolean =>
  jobs.some((job) => job.kind === 'gltf.convert' && (job.status === 'queued' || job.status === 'running'));

const previewJsonPlan = (status: PreviewStatus, extras: Record<string, unknown> = {}, statusCode = 200): ResponsePlan =>
  jsonPlan(statusCode, {
    ok: status !== 'error',
    status,
    ...extras
  });

const buildSnapshotPayload = (project: NativeProjectSnapshot, revision: number) => ({
  projectId: project.projectId,
  name: project.name,
  revision,
  hasGeometry: project.hasGeometry,
  ...(project.focusAnchor
    ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] }
    : {}),
  hierarchy: project.hierarchy.map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    children: node.children.map((child) => ({
      id: child.id,
      name: child.name,
      kind: child.kind,
      children: []
    }))
  })),
  animations: project.animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: animation.length,
    loop: animation.loop
  })),
  stats: {
    bones: project.stats.bones,
    cubes: project.stats.cubes
  }
});

@Injectable()
export class GatewayDashboardService {
  constructor(private readonly runtime: GatewayRuntimeService) {}

  async health(): Promise<ResponsePlan> {
    return jsonPlan(200, {
      ok: this.runtime.persistence.health.database.ready && this.runtime.persistence.health.storage.ready,
      persistence: this.runtime.persistence.health
    });
  }

  async listProjects(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    return jsonPlan(200, {
      ok: true,
      projects: await this.runtime.dashboardStore.listProjects(q)
    });
  }

  async listJobs(projectId: string): Promise<ResponsePlan> {
    const project = await this.runtime.dashboardStore.getProject(projectId);
    if (!project) {
      return jsonPlan(404, {
        ok: false,
        code: 'project_load_failed',
        message: `Project not found: ${projectId}`
      });
    }

    return jsonPlan(200, {
      ok: true,
      jobs: await this.runtime.dashboardStore.listProjectJobs(projectId)
    });
  }

  async submitJob(projectId: string, body: SubmitJobDto): Promise<ResponsePlan> {
    const project = await this.runtime.dashboardStore.getProject(projectId);
    if (!project) {
      return jsonPlan(404, {
        ok: false,
        code: 'project_load_failed',
        message: `Project not found: ${projectId}`
      });
    }

    let normalizedKind: SupportedNativeJobKind;
    try {
      normalizedKind = normalizeSupportedNativeJobKind(body.kind);
    } catch (error) {
      if (error instanceof NativeJobContractError) {
        return jsonPlan(400, {
          ok: false,
          code: 'invalid_payload',
          message: error.message
        });
      }
      throw error;
    }

    const parsedMaxAttempts = parseOptionalPositiveInt(body.maxAttempts);
    if (!parsedMaxAttempts.ok) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'maxAttempts must be a positive integer'
      });
    }

    const parsedLeaseMs = parseOptionalPositiveInt(body.leaseMs);
    if (!parsedLeaseMs.ok) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'leaseMs must be a positive integer'
      });
    }

    const submitOptions = {
      maxAttempts: parsedMaxAttempts.value,
      leaseMs: parsedLeaseMs.value
    };

    try {
      if (normalizedKind === 'gltf.convert') {
        const normalizedPayload = normalizeNativeJobPayload('gltf.convert', body.payload);
        const job = await this.runtime.dashboardStore.submitJob({
          projectId,
          kind: 'gltf.convert',
          ...(normalizedPayload ? { payload: normalizedPayload } : {}),
          ...submitOptions
        });
        return jsonPlan(202, { ok: true, job });
      }

      const normalizedPayload = normalizeNativeJobPayload('texture.preflight', body.payload);
      const job = await this.runtime.dashboardStore.submitJob({
        projectId,
        kind: 'texture.preflight',
        ...(normalizedPayload ? { payload: normalizedPayload } : {}),
        ...submitOptions
      });
      return jsonPlan(202, { ok: true, job });
    } catch (error) {
      if (error instanceof NativeJobContractError) {
        return jsonPlan(400, {
          ok: false,
          code: 'invalid_payload',
          message: error.message
        });
      }
      throw error;
    }
  }

  async preview(projectId: string): Promise<ResponsePlan> {
    const project = await this.runtime.dashboardStore.getProject(projectId);
    if (!project) {
      return previewJsonPlan('error', { code: 'project_not_found', message: `Project not found: ${projectId}` }, 404);
    }
    if (!project.hasGeometry) {
      return previewJsonPlan('empty');
    }

    const jobs = await this.runtime.dashboardStore.listProjectJobs(projectId);
    const completed = latestCompletedGltfJob(jobs);
    if (completed) {
      const exportPath = readExportPath(completed);
      if (exportPath) {
        if (!this.runtime.persistence.health.storage.ready) {
          return previewJsonPlan(
            'error',
            {
              code: 'storage_unavailable',
              message: `Preview storage is unavailable (${this.runtime.persistence.health.storage.provider}).`
            },
            503
          );
        }

        const blob = await this.runtime.persistence.blobStore.get({
          bucket: EXPORT_BUCKET,
          key: buildExportKey(projectId, exportPath)
        });

        if (blob && blob.bytes.byteLength > 0) {
          return previewJsonPlan('ready', {
            projectId,
            revision: project.revision,
            jobId: completed.id,
            gltf: Buffer.from(blob.bytes).toString('utf8')
          });
        }
      }
    }

    if (hasPendingGltfJob(jobs)) {
      return previewJsonPlan('processing', { projectId, revision: project.revision });
    }

    const submitted = await this.runtime.dashboardStore.submitJob({
      projectId,
      kind: 'gltf.convert',
      payload: {
        codecId: 'gltf',
        optimize: true
      }
    });

    return previewJsonPlan('processing', {
      projectId,
      revision: project.revision,
      jobId: submitted.id
    });
  }

  async stream(request: FastifyRequest, projectId: string, query: StreamQueryDto): Promise<ResponsePlan> {
    const project = await this.runtime.dashboardStore.getProject(projectId);
    if (!project) {
      return jsonPlan(404, {
        ok: false,
        code: 'project_load_failed',
        message: `Project not found: ${projectId}`
      });
    }

    const lastEventIdFromQuery = parseLastEventId(query.lastEventId);
    const lastEventIdFromHeader = parseLastEventId(request.headers['last-event-id']);
    const initialCursor = normalizeLastEventId(lastEventIdFromHeader ?? lastEventIdFromQuery);

    const pending = await this.runtime.dashboardStore.getProjectEventsSince(projectId, initialCursor);
    let cursor = initialCursor;
    let sentInitialSnapshot = false;

    const events: string[] = [];
    if (pending.length > 0) {
      events.push(...pending.map((event) => formatSseMessage(event.event, event.seq, event.data)));
      cursor = pending[pending.length - 1]?.seq ?? initialCursor;
      sentInitialSnapshot = true;
    } else {
      const nextEventId = initialCursor + 1;
      const nextRevision = Math.max(project.revision, nextEventId);
      events.push(formatSseMessage('project_snapshot', nextEventId, buildSnapshotPayload(project, nextRevision)));
      cursor = nextEventId;
      sentInitialSnapshot = true;
    }

    return {
      kind: 'sse',
      status: 200,
      headers: {
        ...API_CORS_HEADERS,
        ...STREAM_HEADERS
      },
      events,
      close: false,
      onOpen: (connection) => {
        let localCursor = cursor;
        let localSentInitialSnapshot = sentInitialSnapshot;
        let closed = false;
        let inFlight = false;

        const pump = async () => {
          if (closed || inFlight || connection.isClosed()) {
            return;
          }
          inFlight = true;
          try {
            const current = await this.runtime.dashboardStore.getProject(projectId);
            if (!current) {
              localCursor += 1;
              connection.send(
                formatSseMessage('stream_error', localCursor, {
                  code: 'stream_unavailable',
                  projectId
                })
              );
              return;
            }

            const next = await this.runtime.dashboardStore.getProjectEventsSince(projectId, localCursor);
            if (next.length === 0) {
              if (!localSentInitialSnapshot) {
                const nextEventId = localCursor + 1;
                const nextRevision = Math.max(current.revision, nextEventId);
                connection.send(formatSseMessage('project_snapshot', nextEventId, buildSnapshotPayload(current, nextRevision)));
                localCursor = nextEventId;
                localSentInitialSnapshot = true;
              }
              return;
            }

            for (const event of next) {
              localCursor = event.seq;
              connection.send(formatSseMessage(event.event, event.seq, event.data));
            }
            localSentInitialSnapshot = true;
          } catch {
            localCursor += 1;
            connection.send(
              formatSseMessage('stream_error', localCursor, {
                code: 'stream_unavailable',
                projectId
              })
            );
          } finally {
            inFlight = false;
          }
        };

        void pump();
        const pollTimer = setInterval(() => {
          void pump();
        }, EVENT_POLL_MS);
        const keepAliveTimer = setInterval(() => {
          if (!connection.isClosed()) {
            connection.send(': keepalive\\n\\n');
          }
        }, KEEPALIVE_MS);

        return () => {
          closed = true;
          clearInterval(pollTimer);
          clearInterval(keepAliveTimer);
        };
      }
    };
  }
}
