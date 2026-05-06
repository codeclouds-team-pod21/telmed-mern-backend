import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [CrmModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
