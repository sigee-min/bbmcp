import { All, Controller, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GatewayMcpService } from '../gateway-mcp.service';
import { GatewayRuntimeService } from '../gateway-runtime.service';
import { writePlan } from '../planWriter';

@Controller()
export class McpController {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly mcp: GatewayMcpService
  ) {}

  @All('mcp')
  async handleRoot(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.handle(request, reply);
  }

  @All('mcp/*')
  async handleNested(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.handle(request, reply);
  }

  private async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const plan = await this.mcp.handle(request);
    writePlan(reply, plan);
    this.runtime.metrics.recordMcpRequest(request.method.toUpperCase(), plan.status);
  }
}
