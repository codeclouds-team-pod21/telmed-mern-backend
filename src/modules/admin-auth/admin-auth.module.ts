import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@Global()
@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard, AdminPermissionGuard],
  exports: [AdminAuthService, AdminAuthGuard, AdminPermissionGuard],
})
export class AdminAuthModule {}
