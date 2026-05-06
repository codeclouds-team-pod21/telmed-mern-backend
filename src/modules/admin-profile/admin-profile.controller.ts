import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import type { AdminAuthUser } from '../admin-auth/admin-auth.types';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminProfileService } from './admin-profile.service';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

@Controller('admin/profile')
@UseGuards(AdminAuthGuard)
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  @Get()
  getProfile(@CurrentAdmin() admin: AdminAuthUser) {
    return this.adminProfileService.getProfile(admin.id);
  }

  @Patch()
  updateProfile(
    @CurrentAdmin() admin: AdminAuthUser,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.adminProfileService.updateProfile(admin.id, dto);
  }

  @Patch('password')
  changePassword(
    @CurrentAdmin() admin: AdminAuthUser,
    @Body() dto: ChangeAdminPasswordDto,
  ) {
    return this.adminProfileService.changePassword(admin.id, dto);
  }
}
