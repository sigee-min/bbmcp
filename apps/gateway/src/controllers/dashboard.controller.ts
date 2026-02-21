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
import { CreateWorkspaceApiKeyDto } from '../dto/create-workspace-api-key.dto';
import { DeleteWorkspaceAclRuleDto } from '../dto/delete-workspace-acl-rule.dto';
import { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import { MoveEntityDto } from '../dto/move-entity.dto';
import { RenameEntityDto } from '../dto/rename-entity.dto';
import { RevokeWorkspaceApiKeyDto } from '../dto/revoke-workspace-api-key.dto';
import { SetServiceAccountRolesDto } from '../dto/set-service-account-roles.dto';
import { ServiceUsersQueryDto } from '../dto/service-users-query.dto';
import { ServiceWorkspacesQueryDto } from '../dto/service-workspaces-query.dto';
import { SubmitJobDto } from '../dto/submit-job.dto';
import { StreamQueryDto } from '../dto/stream-query.dto';
import { SetWorkspaceDefaultMemberRoleDto } from '../dto/set-workspace-default-member-role.dto';
import { UpsertServiceGithubAuthSettingsDto } from '../dto/upsert-service-github-auth-settings.dto';
import { UpsertServiceSmtpSettingsDto } from '../dto/upsert-service-smtp-settings.dto';
import { UpsertWorkspaceAclRuleDto } from '../dto/upsert-workspace-acl-rule.dto';
import { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import { WorkspaceMemberCandidatesQueryDto } from '../dto/workspace-member-candidates-query.dto';
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

  @Patch('workspaces/:workspaceId/default-member-role')
  async setWorkspaceDefaultMemberRole(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: SetWorkspaceDefaultMemberRoleDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.setWorkspaceDefaultMemberRole(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
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

  @Get('workspaces/:workspaceId/member-candidates')
  async listWorkspaceMemberCandidates(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Query() query: WorkspaceMemberCandidatesQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceMemberCandidates(request, workspaceId, query);
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

  @Get('workspaces/:workspaceId/acl-rules')
  async listWorkspaceAclRules(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceAclRules(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('workspaces/:workspaceId/acl-rules')
  async upsertWorkspaceAclRule(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: UpsertWorkspaceAclRuleDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertWorkspaceAclRule(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Delete('workspaces/:workspaceId/acl-rules')
  async deleteWorkspaceAclRule(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: DeleteWorkspaceAclRuleDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteWorkspaceAclRule(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('workspaces/:workspaceId/api-keys')
  async listWorkspaceApiKeys(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listWorkspaceApiKeys(request, workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('workspaces/:workspaceId/api-keys')
  async createWorkspaceApiKey(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: CreateWorkspaceApiKeyDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createWorkspaceApiKey(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('workspaces/:workspaceId/api-keys')
  async revokeWorkspaceApiKey(
    @Req() request: FastifyRequest,
    @Param('workspaceId', ProjectIdPipe) workspaceId: string,
    @Body() body: RevokeWorkspaceApiKeyDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.revokeWorkspaceApiKey(request, workspaceId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('service/workspaces')
  async listServiceWorkspaces(
    @Req() request: FastifyRequest,
    @Query() query: ServiceWorkspacesQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listServiceWorkspaces(request, query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('service/users')
  async listServiceUsers(
    @Req() request: FastifyRequest,
    @Query() query: ServiceUsersQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listServiceUsers(request, query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('service/users/:accountId/workspaces')
  async listServiceUserWorkspaces(
    @Req() request: FastifyRequest,
    @Param('accountId', ProjectIdPipe) accountId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listServiceUserWorkspaces(request, accountId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('service/users/:accountId/system-roles')
  async setServiceUserRoles(
    @Req() request: FastifyRequest,
    @Param('accountId', ProjectIdPipe) accountId: string,
    @Body() body: SetServiceAccountRolesDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.setServiceUserRoles(request, accountId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Get('service/config')
  async getServiceConfig(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const plan = await this.dashboard.getServiceConfig(request);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Put('service/config/smtp')
  async upsertServiceSmtpSettings(
    @Req() request: FastifyRequest,
    @Body() body: UpsertServiceSmtpSettingsDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertServiceSmtpSettings(request, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Put('service/config/github')
  async upsertServiceGithubAuthSettings(
    @Req() request: FastifyRequest,
    @Body() body: UpsertServiceGithubAuthSettingsDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.upsertServiceGithubAuthSettings(request, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PUT', plan.status);
  }

  @Get('projects')
  async projects(
    @Req() request: FastifyRequest,
    @Query() query: ListProjectsQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listProjects(request, query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Get('projects/tree')
  async projectTree(
    @Req() request: FastifyRequest,
    @Query() query: ListProjectsQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listProjectTree(request, query);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('folders')
  async createFolder(
    @Req() request: FastifyRequest,
    @Body() body: CreateFolderDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createFolder(request, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Patch('folders/:folderId')
  async renameFolder(
    @Req() request: FastifyRequest,
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Body() body: RenameEntityDto,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameFolder(request, folderId, body, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
  }

  @Post('folders/:folderId/move')
  async moveFolder(
    @Req() request: FastifyRequest,
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Body() body: MoveEntityDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.moveFolder(request, folderId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('folders/:folderId')
  async deleteFolder(
    @Req() request: FastifyRequest,
    @Param('folderId', ProjectIdPipe) folderId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteFolder(request, folderId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Post('projects')
  async createProject(
    @Req() request: FastifyRequest,
    @Body() body: CreateProjectDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.createProject(request, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Patch('projects/:projectId')
  async renameProject(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: RenameEntityDto,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameProject(request, projectId, body, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('PATCH', plan.status);
  }

  @Post('projects/:projectId/move')
  async moveProject(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: MoveEntityDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.moveProject(request, projectId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Delete('projects/:projectId')
  async deleteProject(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteProject(request, projectId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('projects/:projectId/jobs')
  async jobs(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listJobs(request, projectId, workspaceQuery.workspaceId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('GET', plan.status);
  }

  @Post('projects/:projectId/jobs')
  async submitJob(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Body() body: SubmitJobDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.submitJob(request, projectId, body);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('POST', plan.status);
  }

  @Get('projects/:projectId/preview')
  async preview(
    @Req() request: FastifyRequest,
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Query() workspaceQuery: WorkspaceQueryDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.preview(request, projectId, workspaceQuery.workspaceId);
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
