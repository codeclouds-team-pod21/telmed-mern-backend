import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { CrmModule } from '../crm/crm.module';
import { DocumentModule } from '../document/document.module';
import { OrderModule } from '../order/order.module';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [QuestionnaireModule, CrmModule, OrderModule, DocumentModule, VerificationModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
