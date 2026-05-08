import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { DocumentModule } from '../document/document.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [CrmModule, DocumentModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
