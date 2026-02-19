import { Injectable } from '@nestjs/common';
import {
  NativeJobContractError,
  normalizeNativeJobPayload,
  normalizeSupportedNativeJobKind,
  type SupportedNativeJobKind
} from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { API_CORS_HEADERS } from './constants';
import type { CreateFolderDto } from './dto/create-folder.dto';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import type { MoveEntityDto } from './dto/move-entity.dto';
import type { RenameEntityDto } from './dto/rename-entity.dto';
import type { StreamQueryDto } from './dto/stream-query.dto';
import type { SubmitJobDto } from './dto/submit-job.dto';
import {
  EXPORT_BUCKET,
  STREAM_HEADERS,
  buildExportKey,
  decodePreviewGltf,
  formatSseMessage,
  hasPendingGltfJob,
  invalidPayloadPlan,
  jsonPlan,
  latestCompletedGltfJob,
  normalizeLastEventId,
  normalizeOptionalFolderId,
  notFoundPlan,
  parseLastEventId,
  parseOptionalPositiveInt,
  previewJsonPlan,
  readExportPath
} from './gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { buildSnapshotPayload } from './mappers/dashboardSnapshotMapper';
const EVENT_POLL_MS = 1200;
const KEEPALIVE_MS = 15000;

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
    const projects = await this.runtime.dashboardStore.listProjects(q);
    return jsonPlan(200, {
      ok: true,
      projects: projects.map((project) => buildSnapshotPayload(project, project.revision))
    });
  }

  async listProjectTree(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    const [projects, tree] = await Promise.all([
      this.runtime.dashboardStore.listProjects(q),
      this.runtime.dashboardStore.getProjectTree(q)
    ]);
    return jsonPlan(200, {
      ok: true,
      projects: projects.map((project) => buildSnapshotPayload(project, project.revision)),
      tree
    });
  }

  async createFolder(body: CreateFolderDto): Promise<ResponsePlan> {
    try {
      const folder = await this.runtime.dashboardStore.createFolder({
        name: body.name,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      return jsonPlan(201, { ok: true, folder });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create folder.';
      return invalidPayloadPlan(message);
    }
  }

  async renameFolder(folderId: string, body: RenameEntityDto): Promise<ResponsePlan> {
    try {
      const folder = await this.runtime.dashboardStore.renameFolder(folderId, body.name);
      if (!folder) {
        return notFoundPlan('Folder', folderId);
      }
      return jsonPlan(200, { ok: true, folder });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename folder.';
      return invalidPayloadPlan(message);
    }
  }

  async moveFolder(folderId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    try {
      const folder = await this.runtime.dashboardStore.moveFolder({
        folderId,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      if (!folder) {
        return notFoundPlan('Folder', folderId);
      }
      return jsonPlan(200, { ok: true, folder });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move folder.';
      return invalidPayloadPlan(message);
    }
  }

  async deleteFolder(folderId: string): Promise<ResponsePlan> {
    const deleted = await this.runtime.dashboardStore.deleteFolder(folderId);
    if (!deleted) {
      return notFoundPlan('Folder', folderId);
    }
    return jsonPlan(200, { ok: true });
  }

  async createProject(body: CreateProjectDto): Promise<ResponsePlan> {
    try {
      const project = await this.runtime.dashboardStore.createProject({
        name: body.name,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      return jsonPlan(201, { ok: true, project });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project.';
      return invalidPayloadPlan(message);
    }
  }

  async renameProject(projectId: string, body: RenameEntityDto): Promise<ResponsePlan> {
    try {
      const project = await this.runtime.dashboardStore.renameProject(projectId, body.name);
      if (!project) {
        return notFoundPlan('Project', projectId);
      }
      return jsonPlan(200, { ok: true, project });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename project.';
      return invalidPayloadPlan(message);
    }
  }

  async moveProject(projectId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    try {
      const project = await this.runtime.dashboardStore.moveProject({
        projectId,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      if (!project) {
        return notFoundPlan('Project', projectId);
      }
      return jsonPlan(200, { ok: true, project });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move project.';
      return invalidPayloadPlan(message);
    }
  }

  async deleteProject(projectId: string): Promise<ResponsePlan> {
    const deleted = await this.runtime.dashboardStore.deleteProject(projectId);
    if (!deleted) {
      return notFoundPlan('Project', projectId);
    }
    return jsonPlan(200, { ok: true });
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
          const gltfText = decodePreviewGltf(blob.bytes);
          if (!gltfText) {
            this.runtime.logger.warn('ashfox gateway preview blob is not valid glTF JSON', {
              projectId,
              jobId: completed.id,
              exportPath
            });
          } else {
            return previewJsonPlan('ready', {
              projectId,
              revision: project.revision,
              jobId: completed.id,
              gltf: gltfText
            });
          }
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
      const latestPending = pending[pending.length - 1];
      if (latestPending) {
        events.push(
          formatSseMessage(
            latestPending.event,
            latestPending.seq,
            buildSnapshotPayload(latestPending.data, latestPending.data.revision)
          )
        );
      }
      cursor = latestPending?.seq ?? initialCursor;
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

            const latest = next[next.length - 1];
            if (latest) {
              localCursor = latest.seq;
              connection.send(formatSseMessage(latest.event, latest.seq, buildSnapshotPayload(latest.data, latest.data.revision)));
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
