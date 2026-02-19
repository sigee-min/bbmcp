import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { writePlan } from '../planWriter';
import { CreateFolderDto } from '../dto/create-folder.dto';
import { CreateProjectDto } from '../dto/create-project.dto';
import { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import { MoveEntityDto } from '../dto/move-entity.dto';
import { RenameEntityDto } from '../dto/rename-entity.dto';
import { SubmitJobDto } from '../dto/submit-job.dto';
import { StreamQueryDto } from '../dto/stream-query.dto';
import { UpdateWorkspaceModeDto } from '../dto/update-workspace-mode.dto';
import { UpsertWorkspaceFolderAclDto } from '../dto/upsert-workspace-folder-acl.dto';
import { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import { WorkspaceFolderAclQueryDto } from '../dto/workspace-folder-acl-query.dto';
import { WorkspaceQueryDto } from '../dto/workspace-query.dto';
import { ProjectIdPipe } from '../pipes/project-id.pipe';
import { GatewayDashboardService } from '../services/gateway-dashboard.service';
import { GatewayRuntimeService } from '../services/gateway-runtime.service';

@Controller('api')
export class DashboardController {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly dashboard: GatewayDashboardService
  ) {}

  @Get('health')
  async health(@Res() reply: FastifyReply): Promise<void> {
    const plan = await this.dashboard.health();
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('workspaces')
  async listWorkspaces(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaces(request);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('workspaces')
  async createWorkspace(
    @Req() request: FastifyRequest,
    @Body() body: CreateWorkspaceDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createWorkspace(request, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('workspaces/:workspaceId')
  async deleteWorkspace(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteWorkspace(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('workspaces/:workspaceId/settings')
  async getWorkspaceSettings(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.getWorkspaceSettings(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Patch('workspaces/:workspaceId/mode')
  async updateWorkspaceMode(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: UpdateWorkspaceModeDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.updateWorkspaceMode(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
  }

  @Get('workspaces/:workspaceId/roles')
  async listWorkspaceRoles(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceRoles(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('workspaces/:workspaceId/roles')
  async upsertWorkspaceRole(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: UpsertWorkspaceRoleDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertWorkspaceRole(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Delete('workspaces/:workspaceId/roles/:roleId')
  async deleteWorkspaceRole(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Param('roleId', ProjectIdPipe) roleId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteWorkspaceRole(request, workspaceId, roleId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('workspaces/:workspaceId/members')
  async listWorkspaceMembers(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceMembers(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('workspaces/:workspaceId/members')
  async upsertWorkspaceMember(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: UpsertWorkspaceMemberDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertWorkspaceMember(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Delete('workspaces/:workspaceId/members/:accountId')
  async deleteWorkspaceMember(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Param('accountId', ProjectIdPipe) accountId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteWorkspaceMember(request, workspaceId, accountId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('workspaces/:workspaceId/folder-acl')
  async listWorkspaceFolderAcl(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceFolderAcl(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('workspaces/:workspaceId/folder-acl')
  async upsertWorkspaceFolderAcl(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: UpsertWorkspaceFolderAclDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertWorkspaceFolderAcl(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Delete('workspaces/:workspaceId/folder-acl/:roleId')
  async deleteWorkspaceFolderAcl(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Param('roleId', ProjectIdPipe) roleId: string,
    @Query() query: WorkspaceFolderAclQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteWorkspaceFolderAcl(request, workspaceId, roleId, query.folderId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('projects')
  async projects(
    @Query() query: ListProjectsQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listProjects(query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('projects/tree')
  async projectTree(
    @Query() query: ListProjectsQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listProjectTree(query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('folders')
  async createFolder(
    @Body() body: CreateFolderDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createFolder(body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Patch('folders/:folderId')
  async renameFolder(
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Body() body: RenameEntityDto,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameFolder(folderId, body, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
  }

  @Post('folders/:folderId/move')
  async moveFolder(
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Body() body: MoveEntityDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.moveFolder(folderId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('folders/:folderId')
  async deleteFolder(
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteFolder(folderId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Post('projects')
  async createProject(
    @Body() body: CreateProjectDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createProject(body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Patch('projects/:projectId')
  async renameProject(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: RenameEntityDto,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameProject(projectId, body, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
  }

  @Post('projects/:projectId/move')
  async moveProject(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: MoveEntityDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.moveProject(projectId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('projects/:projectId')
  async deleteProject(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteProject(projectId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('projects/:projectId/jobs')
  async jobs(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listJobs(projectId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('projects/:projectId/jobs')
  async submitJob(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: SubmitJobDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.submitJob(projectId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Get('projects/:projectId/preview')
  async preview(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.preview(projectId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('projects/:projectId/stream')
  async stream(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() query: StreamQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.stream(request, projectId, query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }
}
