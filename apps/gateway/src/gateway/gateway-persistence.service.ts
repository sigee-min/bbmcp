import { Inject, Injectable } from '@nestjs/common';
import type { PersistencePorts } from '@ashfox/backend-core';
import { closeGatewayPersistence } from '@ashfox/gateway-persistence';
import { GATEWAY_PERSISTENCE_PORTS } from './tokens';

@Injectable()
export class GatewayPersistenceService {
  constructor(@Inject(GATEWAY_PERSISTENCE_PORTS) readonly ports: PersistencePorts) {}

  async shutdown(): Promise<void> {
    await closeGatewayPersistence(this.ports);
  }
}
