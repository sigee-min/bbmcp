import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { McpController } from './controllers/mcp.controller';
import { MetricsController } from './controllers/metrics.controller';
import { GatewayConfigModule } from './gateway-config.module';
import { GatewayDashboardService } from './gateway-dashboard.service';
import { GatewayMcpService } from './gateway-mcp.service';
import { GatewayMetricsService } from './gateway-metrics.service';
import { GatewayPersistenceModule } from './gateway-persistence.module';
import { gatewayInfrastructureProviders } from './gateway.providers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { ProjectIdPipe } from './pipes/project-id.pipe';

@Module({
  imports: [GatewayConfigModule, GatewayPersistenceModule],
  controllers: [MetricsController, McpController, DashboardController],
  providers: [
    ...gatewayInfrastructureProviders,
    GatewayRuntimeService,
    GatewayMetricsService,
    GatewayDashboardService,
    GatewayMcpService,
    ProjectIdPipe
  ],
  exports: [GatewayRuntimeService]
})
export class GatewayModule {}
