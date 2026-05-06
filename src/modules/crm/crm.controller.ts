import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get(':crmId/campaigns')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'funnels.admin.add', 'funnels.admin.modify')
  getCampaigns(@Param('crmId', ParseIntPipe) crmId: number) {
    return this.crmService.getCampaigns(crmId);
  }

  @Get('campaigns/:campaignId/details')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'funnels.admin.add', 'funnels.admin.modify')
  getCampaignDetails(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.crmService.getCampaignDetails(campaignId);
  }

  @Get(':crmId/details')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify', 'funnels.admin.add', 'funnels.admin.modify')
  getDetails(@Param('crmId', ParseIntPipe) crmId: number) {
    return this.crmService.getDetails(crmId);
  }

  @Post(':crmId/sync')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions(
    'settings.admin.settings',
    'products.admin.add',
    'products.admin.modify',
    'funnels.admin.add',
    'funnels.admin.modify',
  )
  sync(@Param('crmId', ParseIntPipe) crmId: number) {
    return this.crmService.syncCrm(crmId);
  }
}
