import { Injectable } from '@nestjs/common';
import { PROMETHEUS_CONTENT_TYPE } from '@ashfox/runtime/observability';
import { GatewayRuntimeService } from './gateway-runtime.service';

@Injectable()
export class GatewayMetricsService {
  constructor(private readonly runtime: GatewayRuntimeService) {}

  toPrometheusText(): string {
    return this.runtime.metrics.toPrometheusText();
  }

  contentType(): string {
    return PROMETHEUS_CONTENT_TYPE;
  }
}
