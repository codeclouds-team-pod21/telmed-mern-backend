import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { VrioProvider } from './providers/vrio.provider';

@Module({
  controllers: [CrmController],
  providers: [CrmService, VrioProvider],
  exports: [CrmService],
})
export class CrmModule {}
