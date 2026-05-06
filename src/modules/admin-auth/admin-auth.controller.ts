import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RefreshAdminSessionDto } from './dto/refresh-admin-session.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import type { AdminAuthUser } from './admin-auth.types';

type RequestWithCookies = {
  headers: {
    cookie?: string;
  };
};

@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Post('verify-two-factor')
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    return this.adminAuthService.verifyTwoFactor(dto);
  }

  @Post('resend-two-factor')
  resendTwoFactor(@Body('challengeToken') challengeToken: string) {
    return this.adminAuthService.resendTwoFactorCode(challengeToken);
  }

  @Post('refresh')
  refresh(
    @Body() dto: RefreshAdminSessionDto,
    @Req() request: RequestWithCookies,
  ) {
    const refreshToken = dto.refreshToken ?? this.extractCookie(request, 'tm_admin_refresh');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    return this.adminAuthService.refresh(refreshToken);
  }

  @Post('logout')
  logout(
    @Body() dto: RefreshAdminSessionDto,
    @Req() request: RequestWithCookies,
  ) {
    const refreshToken = dto.refreshToken ?? this.extractCookie(request, 'tm_admin_refresh');
    return this.adminAuthService.logout(refreshToken);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminAuthUser) {
    return admin;
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
