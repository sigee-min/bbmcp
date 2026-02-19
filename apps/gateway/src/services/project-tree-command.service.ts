import { Injectable } from '@nestjs/common';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { CreateFolderDto } from '../dto/create-folder.dto';
import type { CreateProjectDto } from '../dto/create-project.dto';
import type { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import type { MoveEntityDto } from '../dto/move-entity.dto';
import type { RenameEntityDto } from '../dto/rename-entity.dto';
import {
  errorMessageOrFallback,
  invalidPayloadPlan,
  jsonPlan,
  normalizeOptionalFolderId,
  notFoundPlan,
  resolveWorkspaceId
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { buildSnapshotPayload } from '../mappers/dashboardSnapshotMapper';

@Injectable()
export class ProjectTreeCommandService {
  constructor(private readonly runtime: GatewayRuntimeService) {}

  async listProjects(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    const workspaceId = resolveWorkspaceId(query.workspaceId);
    const projects = await this.runtime.dashboardStore.listProjects(q, workspaceId);
    return jsonPlan(200, {
      ok: true,
      workspaceId,
      projects: projects.map((project) => buildSnapshotPayload(project, project.revision))
    });
  }

  async listProjectTree(query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    const workspaceId = resolveWorkspaceId(query.workspaceId);
    const [projects, tree] = await Promise.all([
      this.runtime.dashboardStore.listProjects(q, workspaceId),
      this.runtime.dashboardStore.getProjectTree(q, workspaceId)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspaceId,
      projects: projects.map((project) => buildSnapshotPayload(project, project.revision)),
      tree
    });
  }

  async createFolder(body: CreateFolderDto): Promise<ResponsePlan> {
    const workspaceId = resolveWorkspaceId(body.workspaceId);
    try {
      const folder = await this.runtime.dashboardStore.createFolder({
        workspaceId,
        name: body.name,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      return jsonPlan(201, { ok: true, folder });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to create folder.'));
    }
  }

  async renameFolder(folderId: string, body: RenameEntityDto, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    try {
      const folder = await this.runtime.dashboardStore.renameFolder(folderId, body.name, resolvedWorkspaceId);
      if (!folder) {
        return notFoundPlan('Folder', folderId);
      }
      return jsonPlan(200, { ok: true, folder });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to rename folder.'));
    }
  }

  async moveFolder(folderId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    const workspaceId = resolveWorkspaceId(body.workspaceId);
    try {
      const folder = await this.runtime.dashboardStore.moveFolder({
        workspaceId,
        folderId,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      if (!folder) {
        return notFoundPlan('Folder', folderId);
      }
      return jsonPlan(200, { ok: true, folder });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to move folder.'));
    }
  }

  async deleteFolder(folderId: string, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    const deleted = await this.runtime.dashboardStore.deleteFolder(folderId, resolvedWorkspaceId);
    if (!deleted) {
      return notFoundPlan('Folder', folderId);
    }
    return jsonPlan(200, { ok: true });
  }

  async createProject(body: CreateProjectDto): Promise<ResponsePlan> {
    const workspaceId = resolveWorkspaceId(body.workspaceId);
    const normalizedName = typeof body.name === 'string' ? body.name : '';
    try {
      const project = await this.runtime.dashboardStore.createProject({
        workspaceId,
        name: normalizedName,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      return jsonPlan(201, { ok: true, project });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to create project.'));
    }
  }

  async renameProject(projectId: string, body: RenameEntityDto, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    try {
      const project = await this.runtime.dashboardStore.renameProject(projectId, body.name, resolvedWorkspaceId);
      if (!project) {
        return notFoundPlan('Project', projectId);
      }
      return jsonPlan(200, { ok: true, project });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to rename project.'));
    }
  }

  async moveProject(projectId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    const workspaceId = resolveWorkspaceId(body.workspaceId);
    try {
      const project = await this.runtime.dashboardStore.moveProject({
        workspaceId,
        projectId,
        parentFolderId: normalizeOptionalFolderId(body.parentFolderId),
        index: body.index
      });
      if (!project) {
        return notFoundPlan('Project', projectId);
      }
      return jsonPlan(200, { ok: true, project });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to move project.'));
    }
  }

  async deleteProject(projectId: string, workspaceId?: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
    const deleted = await this.runtime.dashboardStore.deleteProject(projectId, resolvedWorkspaceId);
    if (!deleted) {
      return notFoundPlan('Project', projectId);
    }
    return jsonPlan(200, { ok: true });
  }
}
