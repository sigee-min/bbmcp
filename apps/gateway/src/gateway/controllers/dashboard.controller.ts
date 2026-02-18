import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GatewayDashboardService } from '../gateway-dashboard.service';
import { GatewayRuntimeService } from '../gateway-runtime.service';
import { writePlan } from '../planWriter';
import { ListProjectsQueryDto } from '../dto/list-projects-query.dto';
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
