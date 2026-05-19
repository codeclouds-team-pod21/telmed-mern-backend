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
import { CreateProductDto } from './dto/create-product.dto';
import { CloneProductDto } from './dto/clone-product.dto';
import { ManageProductDatasetDto } from './dto/manage-product-dataset.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('admin')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.list')
  listAdmin(
    @Query('searchText') searchText?: string,
    @Query('status') status?: string,
  ) {
    return this.productService.findAll(
      searchText,
      status === undefined ? undefined : status === 'true',
    );
  }

  @Get('admin/create-options')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify')
  getAdminCreateOptions() {
    return this.productService.getCreateOptions();
  }

  @Get('admin/datasets/:type')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify')
  getAdminDatasets(
    @Param('type') type: ManageProductDatasetDto['type'],
  ) {
    return this.productService.getManagedDatasets(type);
  }

  @Post('admin/datasets')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify')
  createAdminDataset(@Body() dto: ManageProductDatasetDto) {
    return this.productService.createManagedDataset(dto);
  }

  @Delete('admin/datasets/:type/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add', 'products.admin.modify')
  deleteAdminDataset(
    @Param('type') type: ManageProductDatasetDto['type'],
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.productService.deleteManagedDataset(id, type);
  }

  @Get('admin/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.view', 'products.admin.modify')
  findAdminOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }

  @Get()
  findAll(
    @Query('searchText') searchText?: string,
    @Query('status') status?: string,
  ) {
    return this.productService.findAll(
      searchText,
      status === undefined ? undefined : status === 'true',
    );
  }

  @Get('check-slug/:slug')
  checkSlug(@Param('slug') slug: string) {
    return this.productService.checkSlug(slug);
  }

  @Get('create-options')
  getCreateOptions() {
    return this.productService.getCreateOptions();
  }

  @Get('keypoints')
  getKeypoints() {
    return this.productService.getKeypointSuggestions();
  }

  @Get('swap-products/:type')
  getSwapProducts(
    @Param('type') type: string,
    @Query('productId') productId?: string,
  ) {
    return this.productService.getSwapProductsByType(
      type,
      productId ? Number(productId) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }

  @Post()
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add')
  create(@Body() dto: CreateProductDto, @CurrentAdmin() admin?: AdminAuthUser) {
    return this.productService.create(dto, admin?.id);
  }

  @Patch(':id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.modify')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.productService.update(id, dto, admin?.id);
  }

  @Post('admin/:id/clone')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.add')
  clone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneProductDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.productService.clone(id, dto.name, admin?.id);
  }

  @Delete(':id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('products.admin.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.productService.remove(id, admin?.id);
  }
}
