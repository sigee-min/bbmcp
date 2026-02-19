import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GatewayMetricsService } from '../services/gateway-metrics.service';
import { GatewayRuntimeService } from '../services/gateway-runtime.service';

@Controller()
export class MetricsController {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly metrics: GatewayMetricsService
  ) {}

  @Get('metrics')
  async metricsEndpoint(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    reply.code(200);
    reply.header('content-type', this.metrics.contentType());
    reply.header('cache-control', 'no-cache');
    reply.send(this.metrics.toPrometheusText());
    this.runtime.metrics.recordMcpRequest(request.method.toUpperCase(), 200);
  }
}
