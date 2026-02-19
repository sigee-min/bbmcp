import { Module } from '@nestjs/common';
import { GatewayModule } from './gateway.module';

@Module({
  imports: [GatewayModule]
})
export class AppModule {}
