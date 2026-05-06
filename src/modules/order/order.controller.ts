import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('admin')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('orders.admin.list')
  listAdminOrders(
    @Query('searchText') searchText?: string,
    @Query('status') status?: string,
  ) {
    return this.orderService.listAdminOrders(searchText, status);
  }

  @Get('admin/:orderId')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('orders.admin.list')
  getAdminOrderDetails(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.orderService.getAdminOrderDetails(orderId);
  }

  @Post('customer/:customerId')
  createOrder(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(customerId, dto);
  }

  @Post(':orderId/capture')
  captureAuthorizedOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.orderService.captureAuthorizedOrder(orderId);
  }

  @Post('customer/:customerId/coupon')
  validateCoupon(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: ValidateCouponDto,
  ) {
    return this.orderService.validateCoupon(customerId, dto);
  }

  @Delete('customer/:customerId/coupon')
  removeCoupon(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.orderService.removeCoupon(customerId);
  }

  @Get('eligibility/:orderApiId')
  checkOfferEligibility(@Param('orderApiId') orderApiId: string) {
    return this.orderService.checkOfferEligibility(orderApiId);
  }

  @Get('customer/:customerId')
  getOrdersForDashboard(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Query('status') status?: string,
    @Query('dateRange') dateRange?: string,
  ) {
    return this.orderService.getOrdersForDashboard(customerId, {
      status,
      dateRange,
    });
  }
}
