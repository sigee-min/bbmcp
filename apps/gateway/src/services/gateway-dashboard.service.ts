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
import type { CreateWorkspaceApiKeyDto } from '../dto/create-workspace-api-key.dto';
import type { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import type { MoveEntityDto } from '../dto/move-entity.dto';
import type { RenameEntityDto } from '../dto/rename-entity.dto';
import type { ServiceUsersQueryDto } from '../dto/service-users-query.dto';
import type { ServiceWorkspacesQueryDto } from '../dto/service-workspaces-query.dto';
import type { StreamQueryDto } from '../dto/stream-query.dto';
import type { SubmitJobDto } from '../dto/submit-job.dto';
import type { DeleteWorkspaceAclRuleDto } from '../dto/delete-workspace-acl-rule.dto';
import type { RevokeWorkspaceApiKeyDto } from '../dto/revoke-workspace-api-key.dto';
import type { SetServiceAccountRolesDto } from '../dto/set-service-account-roles.dto';
import type { SetWorkspaceDefaultMemberRoleDto } from '../dto/set-workspace-default-member-role.dto';
import type { UpsertServiceGithubAuthSettingsDto } from '../dto/upsert-service-github-auth-settings.dto';
import type { UpsertServiceSmtpSettingsDto } from '../dto/upsert-service-smtp-settings.dto';
import type { UpsertWorkspaceAclRuleDto } from '../dto/upsert-workspace-acl-rule.dto';
import type { WorkspaceMemberCandidatesQueryDto } from '../dto/workspace-member-candidates-query.dto';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import {
  EXPORT_BUCKET,
  STREAM_HEADERS,
  buildExportKey,
  decodePreviewGltf,
  forbiddenPlan,
  formatSseMessage,
  hasPendingGltfJob,
  jsonPlan,
  latestCompletedGltfJobForRevision,
  normalizeLastEventId,
  parseLastEventId,
  parseOptionalPositiveInt,
  previewJsonPlan,
  projectLoadFailedPlan,
  readExportPath,
  requireWorkspaceId,
  normalizeOptionalWorkspaceId,
  resolveActorContext,
  workspaceNotFoundPlan
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { buildSnapshotPayload } from '../mappers/dashboardSnapshotMapper';
import { ProjectTreeCommandService } from './project-tree-command.service';
import { WorkspaceAdminService } from './workspace-admin.service';
import { WorkspacePolicyService } from '../security/workspace-policy.service';
import { ServiceManagementService } from './service-management.service';

const EVENT_POLL_MS = 1200;
const KEEPALIVE_MS = 15000;

@Injectable()
export class GatewayDashboardService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspacePolicy: WorkspacePolicyService,
    private readonly workspaceAdmin: WorkspaceAdminService,
    private readonly projectTreeCommand: ProjectTreeCommandService,
    private readonly serviceManagement: ServiceManagementService
  ) {}

  private readWorkspaceId(value: unknown): string | null {
    return normalizeOptionalWorkspaceId(value) ?? null;
  }

  private async authorizeWorkspaceRead(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan | null> {
    const actor = resolveActorContext(request.headers as Record<string, unknown>);
    const authorization = await this.workspacePolicy.authorizeWorkspaceAccess(workspaceId, actor, 'workspace.member');
    if (authorization.ok) {
      return null;
    }
    if (authorization.reason === 'workspace_not_found') {
      return workspaceNotFoundPlan(workspaceId);
    }
    return forbiddenPlan('Workspace membership is required.', 'forbidden_workspace_read');
  }

  private async authorizeWorkspaceWrite(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan | null> {
    const actor = resolveActorContext(request.headers as Record<string, unknown>);
    const authorization = await this.workspacePolicy.authorizeWorkspaceAccess(workspaceId, actor, 'folder.write');
    if (authorization.ok) {
      return null;
    }
    if (authorization.reason === 'workspace_not_found') {
      return workspaceNotFoundPlan(workspaceId);
    }
    return forbiddenPlan('Folder write permission denied.', 'forbidden_workspace_project_write');
  }

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

  async setWorkspaceDefaultMemberRole(
    request: FastifyRequest,
    workspaceId: string,
    body: SetWorkspaceDefaultMemberRoleDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.setWorkspaceDefaultMemberRole(request, workspaceId, body);
  }

  async listWorkspaceMembers(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceMembers(request, workspaceId);
  }

  async listWorkspaceMemberCandidates(
    request: FastifyRequest,
    workspaceId: string,
    query: WorkspaceMemberCandidatesQueryDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceMemberCandidates(request, workspaceId, query);
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

  async listWorkspaceAclRules(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceAclRules(request, workspaceId);
  }

  async upsertWorkspaceAclRule(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.upsertWorkspaceAclRule(request, workspaceId, body);
  }

  async deleteWorkspaceAclRule(
    request: FastifyRequest,
    workspaceId: string,
    body: DeleteWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.deleteWorkspaceAclRule(request, workspaceId, body);
  }

  async listWorkspaceApiKeys(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return this.workspaceAdmin.listWorkspaceApiKeys(request, workspaceId);
  }

  async createWorkspaceApiKey(
    request: FastifyRequest,
    workspaceId: string,
    body: CreateWorkspaceApiKeyDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.createWorkspaceApiKey(request, workspaceId, body);
  }

  async revokeWorkspaceApiKey(
    request: FastifyRequest,
    workspaceId: string,
    body: RevokeWorkspaceApiKeyDto
  ): Promise<ResponsePlan> {
    return this.workspaceAdmin.revokeWorkspaceApiKey(request, workspaceId, body);
  }

  async listServiceWorkspaces(request: FastifyRequest, query: ServiceWorkspacesQueryDto): Promise<ResponsePlan> {
    return this.serviceManagement.listServiceWorkspaces(request, query);
  }

  async listServiceUsers(request: FastifyRequest, query: ServiceUsersQueryDto): Promise<ResponsePlan> {
    return this.serviceManagement.listServiceUsers(request, query);
  }

  async listServiceUserWorkspaces(request: FastifyRequest, accountId: string): Promise<ResponsePlan> {
    return this.serviceManagement.listServiceUserWorkspaces(request, accountId);
  }

  async setServiceUserRoles(
    request: FastifyRequest,
    accountId: string,
    body: SetServiceAccountRolesDto
  ): Promise<ResponsePlan> {
    return this.serviceManagement.setServiceUserRoles(request, accountId, body);
  }

  async getServiceConfig(request: FastifyRequest): Promise<ResponsePlan> {
    return this.serviceManagement.getServiceConfig(request);
  }

  async upsertServiceSmtpSettings(
    request: FastifyRequest,
    body: UpsertServiceSmtpSettingsDto
  ): Promise<ResponsePlan> {
    return this.serviceManagement.upsertServiceSmtpSettings(request, body);
  }

  async upsertServiceGithubAuthSettings(
    request: FastifyRequest,
    body: UpsertServiceGithubAuthSettingsDto
  ): Promise<ResponsePlan> {
    return this.serviceManagement.upsertServiceGithubAuthSettings(request, body);
  }

  async listProjects(request: FastifyRequest, query: ListProjectsQueryDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.listProjects(request, query);
  }

  async listProjectTree(request: FastifyRequest, query: ListProjectsQueryDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.listProjectTree(request, query);
  }

  async createFolder(request: FastifyRequest, body: CreateFolderDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.createFolder(request, body);
  }

  async renameFolder(
    request: FastifyRequest,
    folderId: string,
    body: RenameEntityDto,
    workspaceId: string
  ): Promise<ResponsePlan> {
    return this.projectTreeCommand.renameFolder(request, folderId, body, workspaceId);
  }

  async moveFolder(request: FastifyRequest, folderId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.moveFolder(request, folderId, body);
  }

  async deleteFolder(request: FastifyRequest, folderId: string, workspaceId: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.deleteFolder(request, folderId, workspaceId);
  }

  async createProject(request: FastifyRequest, body: CreateProjectDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.createProject(request, body);
  }

  async renameProject(
    request: FastifyRequest,
    projectId: string,
    body: RenameEntityDto,
    workspaceId: string
  ): Promise<ResponsePlan> {
    return this.projectTreeCommand.renameProject(request, projectId, body, workspaceId);
  }

  async moveProject(request: FastifyRequest, projectId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    return this.projectTreeCommand.moveProject(request, projectId, body);
  }

  async deleteProject(request: FastifyRequest, projectId: string, workspaceId: string): Promise<ResponsePlan> {
    return this.projectTreeCommand.deleteProject(request, projectId, workspaceId);
  }

  async listJobs(request: FastifyRequest, projectId: string, workspaceId: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = this.readWorkspaceId(workspaceId);
    if (!resolvedWorkspaceId) {
      return jsonPlan(400, { ok: false, code: 'invalid_payload', message: 'workspaceId is required' });
    }
    const authPlan = await this.authorizeWorkspaceRead(request, resolvedWorkspaceId);
    if (authPlan) {
      return authPlan;
    }
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

  async submitJob(request: FastifyRequest, projectId: string, body: SubmitJobDto): Promise<ResponsePlan> {
    let workspaceId: string;
    try {
      workspaceId = requireWorkspaceId(body.workspaceId);
    } catch (error) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: error instanceof Error ? error.message : 'workspaceId is required'
      });
    }
    const authPlan = await this.authorizeWorkspaceWrite(request, workspaceId);
    if (authPlan) {
      return authPlan;
    }
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

  async preview(request: FastifyRequest, projectId: string, workspaceId: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = this.readWorkspaceId(workspaceId);
    if (!resolvedWorkspaceId) {
      return jsonPlan(400, { ok: false, code: 'invalid_payload', message: 'workspaceId is required' });
    }
    const authPlan = await this.authorizeWorkspaceRead(request, resolvedWorkspaceId);
    if (authPlan) {
      return authPlan;
    }
    const project = await this.runtime.dashboardStore.getProject(projectId, resolvedWorkspaceId);
    if (!project) {
      return previewJsonPlan('error', { code: 'project_not_found', message: `Project not found: ${projectId}` }, 404);
    }
    if (!project.hasGeometry) {
      return previewJsonPlan('empty');
    }

    const jobs = await this.runtime.dashboardStore.listProjectJobs(projectId, resolvedWorkspaceId);
    const completed = latestCompletedGltfJobForRevision(jobs, project.revision);
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
    const workspaceId = this.readWorkspaceId(query.workspaceId);
    if (!workspaceId) {
      return jsonPlan(400, { ok: false, code: 'invalid_payload', message: 'workspaceId is required' });
    }
    const authPlan = await this.authorizeWorkspaceRead(request, workspaceId);
    if (authPlan) {
      return authPlan;
    }
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
