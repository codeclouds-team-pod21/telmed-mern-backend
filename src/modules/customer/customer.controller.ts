import {
  UseGuards,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { CustomerService } from './customer.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpsertCustomerAddressDto } from './dto/upsert-customer-address.dto';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { SaveQuestionnaireDto } from '../questionnaire/dto/save-questionnaire.dto';
import { CreateFunnelCustomerDto } from './dto/create-funnel-customer.dto';
import { CurrentCustomer } from '../customer-auth/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../customer-auth/guards/customer-auth.guard';
import type { CustomerAuthUser } from '../customer-auth/customer-auth.types';
import { OrderService } from '../order/order.service';
import { CreateSwapOrderDto } from '../order/dto/create-swap-order.dto';

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly orderService: OrderService,
  ) {}

  @Get('admin')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('customers.admin.list')
  listAdminCustomers(
    @Query('searchText') searchText?: string,
    @Query('status') status?: string,
  ) {
    return this.customerService.listAdminCustomers(
      searchText,
      status === undefined ? undefined : status === 'true',
    );
  }

  @Post('funnel-register')
  createFunnelCustomer(@Body() dto: CreateFunnelCustomerDto) {
    return this.customerService.createFunnelCustomer(dto);
  }

  @Get(':customerId/dashboard')
  @UseGuards(CustomerAuthGuard)
  getDashboard(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
    @Query('status') status?: string,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getDashboard(customerId, status);
  }

  @Get(':customerId/profile')
  @UseGuards(CustomerAuthGuard)
  getProfile(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getProfile(customerId);
  }

  @Get(':customerId/funnel-progress/:funnelProductId')
  @UseGuards(CustomerAuthGuard)
  getFunnelProgress(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('funnelProductId', ParseIntPipe) funnelProductId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getFunnelProgress(customerId, funnelProductId);
  }

  @Patch(':customerId/profile')
  @UseGuards(CustomerAuthGuard)
  updateProfile(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.updateProfile(customerId, dto);
  }

  @Post(':customerId/addresses')
  @UseGuards(CustomerAuthGuard)
  upsertAddress(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: UpsertCustomerAddressDto,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.upsertAddress(customerId, dto);
  }

  @Post(':customerId/questionnaire-answers')
  @UseGuards(CustomerAuthGuard)
  saveQuestionnaireAnswers(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: SaveQuestionnaireDto,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.questionnaireService.saveAnswers(customerId, dto);
  }

  @Delete(':customerId/addresses/:addressId')
  @UseGuards(CustomerAuthGuard)
  deleteAddress(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('addressId', ParseIntPipe) addressId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.deleteAddress(customerId, addressId);
  }

  @Get(':customerId/orders/:orderId/treatment-details')
  @UseGuards(CustomerAuthGuard)
  getTreatmentDetails(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getTreatmentDetails(customerId, orderId);
  }

  @Get(':customerId/orders/:orderId/swap-options')
  @UseGuards(CustomerAuthGuard)
  getSwapOptions(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getSwapOptions(customerId, orderId);
  }

  @Get(':customerId/products/:productId/swap-questionnaire')
  @UseGuards(CustomerAuthGuard)
  getSwapQuestionnaire(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getSwapQuestionnaire(customerId, productId);
  }

  @Get(':customerId/orders/:orderId/swap-checkout')
  @UseGuards(CustomerAuthGuard)
  getSwapCheckoutDetails(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Query('productVariantId', ParseIntPipe) productVariantId: number,
    @Query('planId', ParseIntPipe) planId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.customerService.getSwapCheckoutDetails(
      customerId,
      orderId,
      productVariantId,
      planId,
    );
  }

  @Post(':customerId/orders/:orderId/swap')
  @UseGuards(CustomerAuthGuard)
  submitSwapOrder(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: CreateSwapOrderDto,
  ) {
    this.assertCustomerAccess(customer, customerId);
    return this.orderService.submitSwapOrder(customerId, orderId, dto);
  }

  private assertCustomerAccess(customer: CustomerAuthUser | undefined, customerId: number) {
    if (!customer || customer.id !== customerId) {
      throw new ForbiddenException('You are not allowed to access this customer.');
    }
  }
}
