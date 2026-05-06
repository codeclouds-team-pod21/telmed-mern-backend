import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { DoctorNetworkService } from './doctor-network.service';

@Controller('doctor-network')
export class DoctorNetworkController {
  constructor(private readonly doctorNetworkService: DoctorNetworkService) {}

  @Get(':doctorNetworkId/offers')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'settings.admin.settings')
  getOffers(@Param('doctorNetworkId', ParseIntPipe) doctorNetworkId: number) {
    return this.doctorNetworkService.getOffers(doctorNetworkId);
  }

  @Post(':doctorNetworkId/sync')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'settings.admin.settings')
  sync(@Param('doctorNetworkId', ParseIntPipe) doctorNetworkId: number) {
    return this.doctorNetworkService.syncOffers(doctorNetworkId);
  }

  @Post(':doctorNetworkId/sync-questionnaire')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'settings.admin.settings')
  syncQuestionnaire(
    @Param('doctorNetworkId', ParseIntPipe) doctorNetworkId: number,
  ) {
    return this.doctorNetworkService.syncQuestionnaire(doctorNetworkId);
  }

  @Post('refresh-token')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('settings.admin.settings')
  refreshTokens() {
    return this.doctorNetworkService.refreshActiveTokens('mdi');
  }
}
