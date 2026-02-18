import { Module } from '@nestjs/common';
import { GatewayConfigService } from './gateway-config.service';
import { GATEWAY_ENV } from './tokens';

@Module({
  providers: [
    {
      provide: GATEWAY_ENV,
      useValue: process.env
    },
    GatewayConfigService
  ],
  exports: [GatewayConfigService]
})
export class GatewayConfigModule {}
