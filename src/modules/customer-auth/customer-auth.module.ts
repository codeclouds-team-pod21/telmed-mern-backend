import { Global, Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';

@Global()
@Module({
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerAuthGuard],
  exports: [CustomerAuthService, CustomerAuthGuard],
})
export class CustomerAuthModule {}
