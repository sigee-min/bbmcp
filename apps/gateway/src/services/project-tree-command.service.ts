import { Injectable } from '@nestjs/common';
import type { NativeProjectSnapshot, NativeProjectTreeNode, NativeProjectTreeSnapshot } from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { CreateFolderDto } from '../dto/create-folder.dto';
import type { CreateProjectDto } from '../dto/create-project.dto';
import type { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import type { MoveEntityDto } from '../dto/move-entity.dto';
import type { RenameEntityDto } from '../dto/rename-entity.dto';
import {
  errorMessageOrFallback,
  forbiddenPlan,
  invalidPayloadPlan,
  jsonPlan,
  normalizeOptionalFolderId,
  normalizeOptionalWorkspaceId,
  notFoundPlan,
  requireWorkspaceId,
  resolveActorContext,
  workspaceNotFoundPlan,
  type GatewayActorContext
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { buildSnapshotPayload } from '../mappers/dashboardSnapshotMapper';
import { WorkspacePolicyService } from '../security/workspace-policy.service';

const ROOT_FOLDER_PATH: readonly (string | null)[] = [null];

@Injectable()
export class ProjectTreeCommandService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspacePolicy: WorkspacePolicyService
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

  private async canReadFolder(
    actor: GatewayActorContext,
    workspaceId: string,
    folderId: string | null,
    folderPathFromRoot: readonly (string | null)[],
    cache: Map<string, Promise<boolean>>
  ): Promise<boolean> {
    const cacheKey = folderId ?? '__root__';
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const evaluation = this.workspacePolicy
      .authorizeProjectRead({
        actor,
        workspaceId,
        folderId,
        folderPathFromRoot,
        projectId: folderId ? `folder:${folderId}` : 'folder:root',
        tool: 'http.projects.read'
      })
      .then((result) => result.ok);
    cache.set(cacheKey, evaluation);
    return evaluation;
  }

  private async canReadProject(
    actor: GatewayActorContext,
    workspaceId: string,
    projectId: string,
    folderId: string | null,
    folderPathFromRoot: readonly (string | null)[],
    cache: Map<string, Promise<boolean>>
  ): Promise<boolean> {
    const cached = cache.get(projectId);
    if (cached) {
      return cached;
    }
    const evaluation = this.workspacePolicy
      .authorizeProjectRead({
        actor,
        workspaceId,
        folderId,
        folderPathFromRoot,
        projectId,
        tool: 'http.projects.read'
      })
      .then((result) => result.ok);
    cache.set(projectId, evaluation);
    return evaluation;
  }

  private async filterProjectTreeNodesByRead(
    actor: GatewayActorContext,
    workspaceId: string,
    nodes: readonly NativeProjectTreeNode[],
    parentFolderPath: readonly (string | null)[],
    folderReadCache: Map<string, Promise<boolean>>,
    projectReadCache: Map<string, Promise<boolean>>
  ): Promise<NativeProjectTreeNode[]> {
    const filtered: NativeProjectTreeNode[] = [];
    for (const node of nodes) {
      if (node.kind === 'folder') {
        const folderPathFromRoot = [...parentFolderPath, node.folderId];
        const folderReadable = await this.canReadFolder(
          actor,
          workspaceId,
          node.folderId,
          folderPathFromRoot,
          folderReadCache
        );
        if (!folderReadable) {
          continue;
        }
        const filteredChildren = await this.filterProjectTreeNodesByRead(
          actor,
          workspaceId,
          node.children,
          folderPathFromRoot,
          folderReadCache,
          projectReadCache
        );
        const keepEmptyFolder = node.children.length === 0;
        if (!keepEmptyFolder && filteredChildren.length === 0) {
          continue;
        }
        filtered.push({
          ...node,
          children: filteredChildren
        });
        continue;
      }

      const projectReadable = await this.canReadProject(
        actor,
        workspaceId,
        node.projectId,
        node.parentFolderId ?? null,
        parentFolderPath,
        projectReadCache
      );
      if (!projectReadable) {
        continue;
      }
      filtered.push(node);
    }
    return filtered;
  }

  private collectVisibleProjectIds(nodes: readonly NativeProjectTreeNode[], output: Set<string>): void {
    for (const node of nodes) {
      if (node.kind === 'project') {
        output.add(node.projectId);
        continue;
      }
      this.collectVisibleProjectIds(node.children, output);
    }
  }

  private async filterProjectVisibility(
    actor: GatewayActorContext,
    workspaceId: string,
    projects: readonly NativeProjectSnapshot[],
    tree: NativeProjectTreeSnapshot
  ): Promise<{
    projects: NativeProjectSnapshot[];
    tree: NativeProjectTreeSnapshot;
  }> {
    const folderReadCache = new Map<string, Promise<boolean>>();
    const projectReadCache = new Map<string, Promise<boolean>>();
    const filteredRoots = await this.filterProjectTreeNodesByRead(
      actor,
      workspaceId,
      tree.roots,
      ROOT_FOLDER_PATH,
      folderReadCache,
      projectReadCache
    );
    const visibleProjectIds = new Set<string>();
    this.collectVisibleProjectIds(filteredRoots, visibleProjectIds);
    const filteredProjects = projects.filter((project) => visibleProjectIds.has(project.projectId));
    return {
      projects: filteredProjects,
      tree: {
        ...tree,
        roots: filteredRoots
      }
    };
  }

  async listProjects(request: FastifyRequest, query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    const workspaceId = this.readWorkspaceId(query.workspaceId);
    if (!workspaceId) {
      return invalidPayloadPlan('workspaceId is required');
    }
    const authPlan = await this.authorizeWorkspaceRead(request, workspaceId);
    if (authPlan) {
      return authPlan;
    }
    const actor = resolveActorContext(request.headers as Record<string, unknown>);
    const [projects, tree] = await Promise.all([
      this.runtime.dashboardStore.listProjects(q, workspaceId),
      this.runtime.dashboardStore.getProjectTree(q, workspaceId)
    ]);
    const filtered = await this.filterProjectVisibility(actor, workspaceId, projects, tree);
    return jsonPlan(200, {
      ok: true,
      workspaceId,
      projects: filtered.projects.map((project) => buildSnapshotPayload(project, project.revision))
    });
  }

  async listProjectTree(request: FastifyRequest, query: ListProjectsQueryDto): Promise<ResponsePlan> {
    const q = query.q && query.q.trim() ? query.q.trim() : undefined;
    const workspaceId = this.readWorkspaceId(query.workspaceId);
    if (!workspaceId) {
      return invalidPayloadPlan('workspaceId is required');
    }
    const authPlan = await this.authorizeWorkspaceRead(request, workspaceId);
    if (authPlan) {
      return authPlan;
    }
    const actor = resolveActorContext(request.headers as Record<string, unknown>);
    const [projects, tree] = await Promise.all([
      this.runtime.dashboardStore.listProjects(q, workspaceId),
      this.runtime.dashboardStore.getProjectTree(q, workspaceId)
    ]);
    const filtered = await this.filterProjectVisibility(actor, workspaceId, projects, tree);
    return jsonPlan(200, {
      ok: true,
      workspaceId,
      projects: filtered.projects.map((project) => buildSnapshotPayload(project, project.revision)),
      tree: filtered.tree
    });
  }

  async createFolder(request: FastifyRequest, body: CreateFolderDto): Promise<ResponsePlan> {
    try {
      const workspaceId = requireWorkspaceId(body.workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, workspaceId);
      if (authPlan) {
        return authPlan;
      }
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

  async renameFolder(request: FastifyRequest, folderId: string, body: RenameEntityDto, workspaceId: string): Promise<ResponsePlan> {
    try {
      const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, resolvedWorkspaceId);
      if (authPlan) {
        return authPlan;
      }
      const folder = await this.runtime.dashboardStore.renameFolder(folderId, body.name, resolvedWorkspaceId);
      if (!folder) {
        return notFoundPlan('Folder', folderId);
      }
      return jsonPlan(200, { ok: true, folder });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to rename folder.'));
    }
  }

  async moveFolder(request: FastifyRequest, folderId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    try {
      const workspaceId = requireWorkspaceId(body.workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, workspaceId);
      if (authPlan) {
        return authPlan;
      }
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

  async deleteFolder(request: FastifyRequest, folderId: string, workspaceId: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = this.readWorkspaceId(workspaceId);
    if (!resolvedWorkspaceId) {
      return invalidPayloadPlan('workspaceId is required');
    }
    const authPlan = await this.authorizeWorkspaceWrite(request, resolvedWorkspaceId);
    if (authPlan) {
      return authPlan;
    }
    const deleted = await this.runtime.dashboardStore.deleteFolder(folderId, resolvedWorkspaceId);
    if (!deleted) {
      return notFoundPlan('Folder', folderId);
    }
    return jsonPlan(200, { ok: true });
  }

  async createProject(request: FastifyRequest, body: CreateProjectDto): Promise<ResponsePlan> {
    const normalizedName = typeof body.name === 'string' ? body.name : '';
    try {
      const workspaceId = requireWorkspaceId(body.workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, workspaceId);
      if (authPlan) {
        return authPlan;
      }
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

  async renameProject(
    request: FastifyRequest,
    projectId: string,
    body: RenameEntityDto,
    workspaceId: string
  ): Promise<ResponsePlan> {
    try {
      const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, resolvedWorkspaceId);
      if (authPlan) {
        return authPlan;
      }
      const project = await this.runtime.dashboardStore.renameProject(projectId, body.name, resolvedWorkspaceId);
      if (!project) {
        return notFoundPlan('Project', projectId);
      }
      return jsonPlan(200, { ok: true, project });
    } catch (error) {
      return invalidPayloadPlan(errorMessageOrFallback(error, 'Failed to rename project.'));
    }
  }

  async moveProject(request: FastifyRequest, projectId: string, body: MoveEntityDto): Promise<ResponsePlan> {
    try {
      const workspaceId = requireWorkspaceId(body.workspaceId);
      const authPlan = await this.authorizeWorkspaceWrite(request, workspaceId);
      if (authPlan) {
        return authPlan;
      }
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

  async deleteProject(request: FastifyRequest, projectId: string, workspaceId: string): Promise<ResponsePlan> {
    const resolvedWorkspaceId = this.readWorkspaceId(workspaceId);
    if (!resolvedWorkspaceId) {
      return invalidPayloadPlan('workspaceId is required');
    }
    const authPlan = await this.authorizeWorkspaceWrite(request, resolvedWorkspaceId);
    if (authPlan) {
      return authPlan;
    }
    const deleted = await this.runtime.dashboardStore.deleteProject(projectId, resolvedWorkspaceId);
    if (!deleted) {
      return notFoundPlan('Project', projectId);
    }
    return jsonPlan(200, { ok: true });
  }
}
