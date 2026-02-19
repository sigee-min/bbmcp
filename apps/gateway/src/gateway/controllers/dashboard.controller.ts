import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GatewayDashboardService } from '../gateway-dashboard.service';
import { GatewayRuntimeService } from '../gateway-runtime.service';
import { writePlan } from '../planWriter';
import { CreateFolderDto } from '../dto/create-folder.dto';
import { CreateProjectDto } from '../dto/create-project.dto';
import { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
import { MoveEntityDto } from '../dto/move-entity.dto';
import { RenameEntityDto } from '../dto/rename-entity.dto';
import { SubmitJobDto } from '../dto/submit-job.dto';
import { StreamQueryDto } from '../dto/stream-query.dto';
import { ProjectIdPipe } from '../pipes/project-id.pipe';

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
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameFolder(folderId, body);
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
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteFolder(folderId);
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
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.renameProject(projectId, body);
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
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.deleteProject(projectId);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest('DELETE', plan.status);
  }

  @Get('projects/:projectId/jobs')
  async jobs(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.listJobs(projectId);
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
    @Res() reply: FastifyReply
  ): Promise<void> {
    const plan = await this.dashboard.preview(projectId);
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
