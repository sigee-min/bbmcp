import { Module } from '@nestjs/common';
import type { PersistenceHealth, PersistencePorts } from '@ashfox/backend-core';
import { createGatewayPersistence } from '@ashfox/gateway-persistence';
import { GatewayConfigModule } from './gateway-config.module';
import { GatewayConfigService } from './services/gateway-config.service';
import { GatewayPersistenceService } from './services/gateway-persistence.service';
import { GATEWAY_PERSISTENCE_HEALTH, GATEWAY_PERSISTENCE_PORTS } from './tokens';

@Module({
  imports: [GatewayConfigModule],
  providers: [
    {
      provide: GATEWAY_PERSISTENCE_PORTS,
      inject: [GatewayConfigService],
      useFactory: (config: GatewayConfigService): PersistencePorts =>
        createGatewayPersistence(config.env, { failFast: config.persistence.failFast })
    },
    {
      provide: GATEWAY_PERSISTENCE_HEALTH,
      inject: [GATEWAY_PERSISTENCE_PORTS],
      useFactory: (ports: PersistencePorts): PersistenceHealth => ports.health
    },
    GatewayPersistenceService
  ],
  exports: [GATEWAY_PERSISTENCE_PORTS, GATEWAY_PERSISTENCE_HEALTH, GatewayPersistenceService]
})
export class GatewayPersistenceModule {}
