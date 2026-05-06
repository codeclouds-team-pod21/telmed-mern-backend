import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Customer } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  compareCustomerPassword,
  hashCustomerPassword,
} from '../customer/customer-password.util';
import type {
  CustomerAuthUser,
  CustomerTokenPayload,
  CustomerTokenType,
} from './customer-auth.types';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerForgotPasswordDto } from './dto/customer-forgot-password.dto';
import { CustomerResetPasswordDto } from './dto/customer-reset-password.dto';

type SessionResponse = {
  customer: CustomerAuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

@Injectable()
export class CustomerAuthService {
  private readonly tokenSecret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly rememberRefreshTokenTtlSeconds: number;
  private readonly resetPasswordTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.tokenSecret =
      this.configService.get<string>('CUSTOMER_AUTH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'telemed-customer-dev-secret';
    this.accessTokenTtlSeconds = Number(
      this.configService.get('CUSTOMER_ACCESS_TOKEN_TTL_SECONDS') ?? 60 * 15,
    );
    this.refreshTokenTtlSeconds = Number(
      this.configService.get('CUSTOMER_REFRESH_TOKEN_TTL_SECONDS') ??
        60 * 60 * 24 * 7,
    );
    this.rememberRefreshTokenTtlSeconds = Number(
      this.configService.get('CUSTOMER_REMEMBER_REFRESH_TOKEN_TTL_SECONDS') ??
        60 * 60 * 24 * 30,
    );
    this.resetPasswordTtlSeconds = Number(
      this.configService.get('CUSTOMER_RESET_PASSWORD_TTL_SECONDS') ?? 60 * 60,
    );
  }

  async login(dto: CustomerLoginDto): Promise<SessionResponse> {
    const customer = await this.findCustomerByEmail(dto.email);
    this.assertValidPassword(dto.password, customer.password);
    return this.createSession(customer, dto.remember ?? false);
  }

  async refresh(refreshToken: string): Promise<SessionResponse> {
    const payload = this.verifyToken(refreshToken, 'refresh');
    const customer = await this.findCustomerById(payload.sub);

    if (!customer.rememberToken) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const expected = Buffer.from(customer.rememberToken, 'hex');
    const actual = this.hashToken(refreshToken);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    return this.createSession(customer, payload.remember ?? false);
  }

  async logout(refreshToken?: string | null) {
    if (!refreshToken) {
      return { success: true };
    }

    try {
      const payload = this.verifyToken(refreshToken, 'refresh');
      await this.prisma.customer.update({
        where: { id: payload.sub },
        data: { rememberToken: null },
      });
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async authenticateAccessToken(token: string): Promise<CustomerAuthUser> {
    const payload = this.verifyToken(token, 'access');
    const customer = await this.findCustomerById(payload.sub);
    return this.toAuthUser(customer);
  }

  async getCurrentCustomer(customerId: number): Promise<CustomerAuthUser> {
    const customer = await this.findCustomerById(customerId);
    return this.toAuthUser(customer);
  }

  async forgotPassword(dto: CustomerForgotPasswordDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { email: dto.email },
    });

    if (!customer || !customer.status) {
      return {
        success: true,
        message: 'If the email exists, a reset link has been generated.',
      };
    }

    const resetToken = this.signToken(
      this.toAuthUser(customer),
      'reset_password',
      this.resetPasswordTtlSeconds,
    );

    return {
      success: true,
      message: 'Reset link generated successfully.',
      resetToken,
      email: customer.email,
      expiresIn: this.resetPasswordTtlSeconds,
    };
  }

  async resetPassword(dto: CustomerResetPasswordDto) {
    const payload = this.verifyToken(dto.token, 'reset_password');
    const customer = await this.findCustomerById(payload.sub);

    if (customer.email !== payload.email) {
      throw new UnauthorizedException('Reset token is no longer valid.');
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        password: hashCustomerPassword(dto.password),
        rememberToken: null,
      },
    });

    return {
      success: true,
      message: 'Password updated successfully.',
    };
  }

  private async createSession(
    customer: Customer,
    remember: boolean,
  ): Promise<SessionResponse> {
    const refreshExpiresIn = remember
      ? this.rememberRefreshTokenTtlSeconds
      : this.refreshTokenTtlSeconds;

    const authCustomer = this.toAuthUser(customer);
    const accessToken = this.signToken(authCustomer, 'access', this.accessTokenTtlSeconds);
    const refreshToken = this.signToken(
      authCustomer,
      'refresh',
      refreshExpiresIn,
      remember,
    );

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        rememberToken: this.hashToken(refreshToken).toString('hex'),
      },
    });

    return {
      customer: authCustomer,
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn,
    };
  }

  private async findCustomerByEmail(email: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (!customer || !customer.status) {
      throw new UnauthorizedException('The provided credentials do not match our records.');
    }

    return customer;
  }

  private async findCustomerById(id: number): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer || !customer.status) {
      throw new UnauthorizedException('Customer session is no longer valid.');
    }

    return customer;
  }

  private assertValidPassword(password: string, hash: string) {
    if (!compareCustomerPassword(password, hash)) {
      throw new UnauthorizedException('The provided credentials do not match our records.');
    }
  }

  private toAuthUser(customer: Customer): CustomerAuthUser {
    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    };
  }

  private signToken(
    input: CustomerAuthUser,
    type: CustomerTokenType,
    ttlSeconds: number,
    remember = false,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload: CustomerTokenPayload = {
      sub: input.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      remember: type === 'refresh' ? remember : undefined,
      type,
      iat: now,
      exp: now + ttlSeconds,
      jti: randomBytes(16).toString('hex'),
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64Url(JSON.stringify(header));
    const encodedPayload = this.base64Url(JSON.stringify(payload));
    const signature = this.base64Url(
      createHmac('sha256', this.tokenSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest(),
    );

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifyToken(token: string, expectedType: CustomerTokenType): CustomerTokenPayload {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException('Invalid token.');
    }

    const expectedSignature = createHmac('sha256', this.tokenSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const actualSignature = Buffer.from(this.fromBase64Url(encodedSignature), 'base64');

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      throw new UnauthorizedException('Invalid token.');
    }

    const payload = JSON.parse(
      Buffer.from(this.fromBase64Url(encodedPayload), 'base64').toString('utf8'),
    ) as CustomerTokenPayload;

    if (payload.type !== expectedType || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired or invalid.');
    }

    return payload;
  }

  private hashToken(token: string) {
    return createHmac('sha256', this.tokenSecret).update(token).digest();
  }

  private base64Url(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private fromBase64Url(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return `${normalized}${padding}`;
  }
}
