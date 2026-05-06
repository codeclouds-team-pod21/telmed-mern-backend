import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { CustomerForgotPasswordDto } from './dto/customer-forgot-password.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerResetPasswordDto } from './dto/customer-reset-password.dto';
import { RefreshCustomerSessionDto } from './dto/refresh-customer-session.dto';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import type { CustomerAuthUser } from './customer-auth.types';

type RequestWithCookies = {
  headers: {
    cookie?: string;
  };
};

@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('login')
  login(@Body() dto: CustomerLoginDto) {
    return this.customerAuthService.login(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: CustomerForgotPasswordDto) {
    return this.customerAuthService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: CustomerResetPasswordDto) {
    return this.customerAuthService.resetPassword(dto);
  }

  @Post('refresh')
  refresh(
    @Body() dto: RefreshCustomerSessionDto,
    @Req() request: RequestWithCookies,
  ) {
    const refreshToken = dto.refreshToken ?? this.extractCookie(request, 'tm_customer_refresh');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    return this.customerAuthService.refresh(refreshToken);
  }

  @Post('logout')
  logout(
    @Body() dto: RefreshCustomerSessionDto,
    @Req() request: RequestWithCookies,
  ) {
    const refreshToken = dto.refreshToken ?? this.extractCookie(request, 'tm_customer_refresh');
    return this.customerAuthService.logout(refreshToken);
  }

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  me(@CurrentCustomer() customer: CustomerAuthUser) {
    return customer;
  }

  private extractCookie(request: RequestWithCookies, name: string) {
    const cookies = request.headers.cookie ?? '';
    for (const part of cookies.split(';')) {
      const [cookieName, ...rest] = part.trim().split('=');
      if (cookieName === name) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return undefined;
  }
}
