import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './modules/product/product.module';
import { CrmModule } from './modules/crm/crm.module';
import { DoctorNetworkModule } from './modules/doctor-network/doctor-network.module';
import { FunnelModule } from './modules/funnel/funnel.module';
import { OrderModule } from './modules/order/order.module';
import { QuestionnaireModule } from './modules/questionnaire/questionnaire.module';
import { CustomerModule } from './modules/customer/customer.module';
import { PatientModule } from './modules/patient/patient.module';
import { DocumentModule } from './modules/document/document.module';
import { SupportModule } from './modules/support/support.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminProfileModule } from './modules/admin-profile/admin-profile.module';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AdminAuthModule,
    AdminProfileModule,
    CustomerAuthModule,
    ProductModule,
    CrmModule,
    DoctorNetworkModule,
    FunnelModule,
    OrderModule,
    QuestionnaireModule,
    CustomerModule,
    PatientModule,
    DocumentModule,
    SupportModule,
    WebhookModule,
    SettingsModule,
    VerificationModule,
  ],
})
export class AppModule {}
