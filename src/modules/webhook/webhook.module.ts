import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { DoctorNetworkModule } from '../doctor-network/doctor-network.module';
import { OrderModule } from '../order/order.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [OrderModule, DoctorNetworkModule, CrmModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
