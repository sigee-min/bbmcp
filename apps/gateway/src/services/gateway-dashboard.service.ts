import { Injectable } from '@nestjs/common';
import {
  NativeJobContractError,
  normalizeNativeJobPayload,
  normalizeSupportedNativeJobKind,
  type SupportedNativeJobKind
} from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { API_CORS_HEADERS } from '../constants';
import type { CreateFolderDto } from '../dto/create-folder.dto';
import type { CreateProjectDto } from '../dto/create-project.dto';
import type { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import type { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import type { MoveEntityDto } from '../dto/move-entity.dto';
import type { RenameEntityDto } from '../dto/rename-entity.dto';
import type { StreamQueryDto } from '../dto/stream-query.dto';
import type { SubmitJobDto } from '../dto/submit-job.dto';
import type { UpdateWorkspaceModeDto } from '../dto/update-workspace-mode.dto';
import type { UpsertWorkspaceFolderAclDto } from '../dto/upsert-workspace-folder-acl.dto';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import {
  EXPORT_BUCKET,
  STREAM_HEADERS,
  buildExportKey,
  decodePreviewGltf,
  formatSseMessage,
  hasPendingGltfJob,
  jsonPlan,
  latestCompletedGltfJob,
  normalizeLastEventId,
  parseLastEventId,
  parseOptionalPositiveInt,
  previewJsonPlan,
  projectLoadFailedPlan,
  readExportPath,
  resolveWorkspaceId
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { buildSnapshotPayload } from '../mappers/dashboardSnapshotMapper';
import { ProjectTreeCommandService } from './project-tree-command.service';
import { WorkspaceAdminService } from './workspace-admin.service';

const EVENT_POLL_MS = 1200;
const KEEPALIVE_MS = 15000;

@Injectable()
export class GatewayDashboardService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspaceAdmin: WorkspaceAdminService,
    private readonly projectTreeCommand: ProjectTreeCommandService
  ) {}

  async health(): Promise<ResponsePlan> {
    return jsonPlan(200, {
      ok: this.runtime.persistence.health.database.ready && this.runtime.persistence.health.storage.ready,
      persistence: this.runtime.persistence.health
    });
  }

  async listWorkspaces(request: FastifyRequest): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaces(request);
  }

  async createWorkspace(request: FastifyRequest, body: CreateWorkspaceDto): Promise<ResponsePlan> {
    return this.workspaceAdmin.createWorkspace(request, body);
  }

  async deleteWorkspace(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.deleteWorkspace(request, workspaceId);
  }

  async getWorkspaceSettings(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.getWorkspaceSettings(request, workspaceId);
  }

  async updateWorkspaceMode(
    request: FastifyRequest,
    workspaceId: string,
    body: UpdateWorkspaceModeDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.updateWorkspaceMode(request, workspaceId, body);
  }

  async listWorkspaceRoles(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceRoles(request, workspaceId);
  }

  async upsertWorkspaceRole(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceRoleDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.upsertWorkspaceRole(request, workspaceId, body);
  }

  async deleteWorkspaceRole(request: FastifyRequest, workspaceId: string, roleId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.deleteWorkspaceRole(request, workspaceId, roleId);
  }

  async listWorkspaceMembers(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceMembers(request, workspaceId);
  }

  async upsertWorkspaceMember(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceMemberDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.upsertWorkspaceMember(request, workspaceId, body);
  }

  async deleteWorkspaceMember(request: FastifyRequest, workspaceId: string, accountId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.deleteWorkspaceMember(request, workspaceId, accountId);
  }

  async listWorkspaceFolderAcl(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceFolderAcl(request, workspaceId);
  }

  async upsertWorkspaceFolderAcl(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceFolderAclDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.upsertWorkspaceFolderAcl(request, workspaceId, body);
  }

  async deleteWorkspaceFolderAcl(
    request: FastifyRequest,
    workspaceId: string,
    roleId: string,
    folderId?: string
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.deleteWorkspaceFolderAcl(request, workspaceId, roleId, folderId);
  }

  async listProjects(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.listProjects(query);
  }

  async listProjectTree(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.listProjectTree(query);
  }

  async createFolder(body: CreateFolderDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.createFolder(body);
  }

  async renameFolder(folderId: string, body: RenameEntityDto, workspaceId?: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.renameFolder(folderId, body, workspaceId);
  }

  async moveFolder(folderId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.moveFolder(folderId, body);
  }

  async deleteFolder(folderId: string, workspaceId?: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.deleteFolder(folderId, workspaceId);
  }

  async createProject(body: CreateProjectDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.createProject(body);
  }

  async renameProject(projectId: string, body: RenameEntityDto, workspaceId?: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.renameProject(projectId, body, workspaceId);
  }

  async moveProject(projectId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.moveProject(projectId, body);
  }

  async deleteProject(projectId: string, workspaceId?: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.deleteProject(projectId, workspaceId);
  }

  async listJobs(projectId: string, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    const project = await this.runtime.dashboardStore.getProject(projectId, resolvedWorkspaceId);
    if (!project) {
      return projectLoadFailedPlan(projectId);
    }

    return jsonPlan(200, {
      ok: true,
      workspaceId: resolvedWorkspaceId,
      jobs: await this.runtime.dashboardStore.listProjectJobs(projectId, resolvedWorkspaceId)
    });
  }

  async submitJob(projectId: string, body: SubmitJobDto): Promise<ResponsePlan> {
    const workspaceId = resolveWorkspaceId(body.workspaceId);
    const project = await this.runtime.dashboardStore.getProject(projectId, workspaceId);
    if (!project) {
      return projectLoadFailedPlan(projectId);
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
          workspaceId,
          projectId,
          kind: 'gltf.convert',
          ...(normalizedPayload ? { payload: normalizedPayload } : {}),
          ...submitOptions
        });
        return jsonPlan(202, { ok: true, job });
      }

      const normalizedPayload = normalizeNativeJobPayload('texture.preflight', body.payload);
      const job = await this.runtime.dashboardStore.submitJob({
        workspaceId,
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

  async preview(projectId: string, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    const project = await this.runtime.dashboardStore.getProject(projectId, resolvedWorkspaceId);
    if (!project) {
      return previewJsonPlan('error', { code: 'project_not_found', message: `Project not found: ${projectId}` }, 404);
    }
    if (!project.hasGeometry) {
      return previewJsonPlan('empty');
    }

    const jobs = await this.runtime.dashboardStore.listProjectJobs(projectId, resolvedWorkspaceId);
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
      workspaceId: resolvedWorkspaceId,
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
    const workspaceId = resolveWorkspaceId(query.workspaceId);
    const project = await this.runtime.dashboardStore.getProject(projectId, workspaceId);
    if (!project) {
      return projectLoadFailedPlan(projectId);
    }

    const lastEventIdFromQuery = parseLastEventId(query.lastEventId);
    const lastEventIdFromHeader = parseLastEventId(request.headers['last-event-id']);
    const initialCursor = normalizeLastEventId(lastEventIdFromHeader ?? lastEventIdFromQuery);

    const pending = await this.runtime.dashboardStore.getProjectEventsSince(projectId, initialCursor, workspaceId);
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
            const current = await this.runtime.dashboardStore.getProject(projectId, workspaceId);
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

            const next = await this.runtime.dashboardStore.getProjectEventsSince(projectId, localCursor, workspaceId);
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
