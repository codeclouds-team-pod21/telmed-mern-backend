import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import type { AdminAuthUser } from '../admin-auth/admin-auth.types';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import { FunnelService } from './funnel.service';

@Controller('funnels')
export class FunnelController {
  constructor(private readonly funnelService: FunnelService) {}

  @Get('admin')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.list')
  listAdminFunnels(
    @Query('searchText') searchText?: string,
    @Query('status') status?: string,
  ) {
    return this.funnelService.listAdminFunnels(
      searchText,
      status === undefined ? undefined : status === 'true',
    );
  }

  @Get('admin/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.view', 'funnels.admin.modify')
  getAdminFunnel(@Param('id', ParseIntPipe) id: number) {
    return this.funnelService.getAdminFunnel(id);
  }

  @Get('active')
  getActiveFunnels() {
    return this.funnelService.getActiveFunnels();
  }

  @Get('states')
  getStates() {
    return this.funnelService.getStates();
  }

  @Get('check-slug/:slug')
  checkSlug(@Param('slug') slug: string) {
    return this.funnelService.checkSlug(slug);
  }

  @Get('create-options')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.add', 'funnels.admin.modify')
  getCreateOptions() {
    return this.funnelService.getCreateOptions();
  }

  @Get('products/:productId/variants')
  getVariants(@Param('productId', ParseIntPipe) productId: number) {
    return this.funnelService.getVariants(productId);
  }

  @Get('crm/:crmId/products')
  getProductsByCrm(
    @Param('crmId', ParseIntPipe) crmId: number,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.funnelService.getProductsByCrm(
      crmId,
      campaignId ? Number(campaignId) : undefined,
    );
  }

  @Get('validate-state/:productId')
  validateState(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('state') state: string,
  ) {
    return this.funnelService.validateState(productId, state);
  }

  @Post()
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.add')
  create(@Body() dto: CreateFunnelDto, @CurrentAdmin() admin?: AdminAuthUser) {
    return this.funnelService.create(dto, admin?.id);
  }

  @Patch(':id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.modify')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFunnelDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.funnelService.update(id, dto, admin?.id);
  }

  @Delete('admin/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('funnels.admin.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.funnelService.remove(id, admin?.id);
  }

  @Get(':slug/:promoSlug')
  getBySlug(
    @Param('slug') slug: string,
    @Param('promoSlug') promoSlug: string,
  ) {
    return this.funnelService.getFunnelBySlugOrPromoSlug(slug, promoSlug);
  }
}
