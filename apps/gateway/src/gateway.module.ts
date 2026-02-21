import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { McpController } from './controllers/mcp.controller';
import { MetricsController } from './controllers/metrics.controller';
import { GatewayConfigModule } from './gateway-config.module';
import { GatewayPersistenceModule } from './gateway-persistence.module';
import { gatewayInfrastructureProviders } from './gateway.providers';
import { ProjectIdPipe } from './pipes/project-id.pipe';
import { AuthService } from './services/auth.service';
import { GatewayDashboardService } from './services/gateway-dashboard.service';
import { GatewayMcpAuthService } from './services/gateway-mcp-auth.service';
import { GatewayMcpService } from './services/gateway-mcp.service';
import { GatewayMetricsService } from './services/gateway-metrics.service';
import { GatewayRuntimeService } from './services/gateway-runtime.service';
import { ProjectTreeCommandService } from './services/project-tree-command.service';
import { ServiceManagementService } from './services/service-management.service';
import { WorkspaceAdminService } from './services/workspace-admin.service';

@Module({
  imports: [GatewayConfigModule, GatewayPersistenceModule],
  controllers: [MetricsController, McpController, DashboardController, AuthController],
  providers: [
    ...gatewayInfrastructureProviders,
    GatewayRuntimeService,
    GatewayMetricsService,
    AuthService,
    WorkspaceAdminService,
    ServiceManagementService,
    ProjectTreeCommandService,
    GatewayDashboardService,
    GatewayMcpAuthService,
    GatewayMcpService,
    ProjectIdPipe
  ],
  exports: [GatewayRuntimeService]
})
export class GatewayModule {}
