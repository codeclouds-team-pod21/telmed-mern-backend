import {
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decryptStoredString,
  looksLikeStoredEncryptedPayload,
} from '../../common/utils/encrypted-config.util';
import { SmtpConfig, sendSmtpMail } from '../../common/utils/smtp-mail.util';
import {
  AdminAuthUser,
  AdminPermission,
  AdminTokenPayload,
  AdminTokenType,
} from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

type SessionResponse = {
  requiresTwoFactor: false;
  user: AdminAuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

type TwoFactorChallengeResponse = {
  requiresTwoFactor: true;
  challengeToken: string;
  maskedEmail: string;
};

@Injectable()
export class AdminAuthService {
  private readonly tokenSecret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly rememberRefreshTokenTtlSeconds: number;
  private readonly twoFactorTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.tokenSecret =
      this.configService.get<string>('ADMIN_AUTH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'telemed-admin-dev-secret';
    this.accessTokenTtlSeconds = Number(
      this.configService.get('ADMIN_ACCESS_TOKEN_TTL_SECONDS') ?? 60 * 15,
    );
    this.refreshTokenTtlSeconds = Number(
      this.configService.get('ADMIN_REFRESH_TOKEN_TTL_SECONDS') ??
        60 * 60 * 24 * 7,
    );
    this.rememberRefreshTokenTtlSeconds = Number(
      this.configService.get('ADMIN_REMEMBER_REFRESH_TOKEN_TTL_SECONDS') ??
        60 * 60 * 24 * 30,
    );
    this.twoFactorTtlSeconds = Number(
      this.configService.get('ADMIN_TWO_FACTOR_TTL_SECONDS') ?? 60 * 10,
    );
  }

  async login(dto: AdminLoginDto): Promise<SessionResponse | TwoFactorChallengeResponse> {
    const user = await this.findAdminUserByEmail(dto.email);
    await this.assertValidPassword(dto.password, user.password);

    const permissions = await this.getPermissions(user.id);
    this.assertHasAdminAccess(permissions);

    if (user.twoFactorEnabled) {
      const code = this.generateTwoFactorCode();
      const expiresAt = new Date(Date.now() + this.twoFactorTtlSeconds * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorCode: code,
          twoFactorExpiresAt: expiresAt,
        },
      });
      await this.sendTwoFactorEmail(user.email, user.name, code);

      return {
        requiresTwoFactor: true,
        challengeToken: this.signToken(
          {
            sub: user.id,
            email: user.email,
            name: user.name,
            permissions,
            remember: dto.remember ?? false,
          },
          'two_factor',
          this.twoFactorTtlSeconds,
        ),
        maskedEmail: this.maskEmail(user.email),
      };
    }

    return this.createSession(user, permissions, dto.remember ?? false);
  }

  async verifyTwoFactor(dto: VerifyTwoFactorDto): Promise<SessionResponse> {
    const payload = this.verifyToken(dto.challengeToken, 'two_factor');
    const user = await this.findAdminUserById(payload.sub);

    if (
      !user.twoFactorCode ||
      user.twoFactorCode !== dto.code ||
      !user.twoFactorExpiresAt ||
      user.twoFactorExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const permissions = await this.getPermissions(user.id);
    this.assertHasAdminAccess(permissions);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: null,
        twoFactorExpiresAt: null,
      },
    });

    return this.createSession(user, permissions, payload.remember ?? false);
  }

  async resendTwoFactorCode(challengeToken: string) {
    const payload = this.verifyToken(challengeToken, 'two_factor');
    const user = await this.findAdminUserById(payload.sub);

    const code = this.generateTwoFactorCode();
    const expiresAt = new Date(Date.now() + this.twoFactorTtlSeconds * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: code,
        twoFactorExpiresAt: expiresAt,
      },
    });
    await this.sendTwoFactorEmail(user.email, user.name, code);

    return {
      success: true,
      challengeToken: this.signToken(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          permissions: await this.getPermissions(user.id),
          remember: payload.remember ?? false,
        },
        'two_factor',
        this.twoFactorTtlSeconds,
      ),
      maskedEmail: this.maskEmail(user.email),
    };
  }

  async refresh(refreshToken: string): Promise<SessionResponse> {
    const payload = this.verifyToken(refreshToken, 'refresh');
    const user = await this.findAdminUserById(payload.sub);

    if (!user.rememberToken) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const expected = Buffer.from(user.rememberToken, 'hex');
    const actual = this.hashToken(refreshToken);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const permissions = await this.getPermissions(user.id);
    this.assertHasAdminAccess(permissions);

    return this.createSession(user, permissions, payload.remember ?? false);
  }

  async logout(refreshToken?: string | null) {
    if (!refreshToken) {
      return { success: true };
    }

    try {
      const payload = this.verifyToken(refreshToken, 'refresh');
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { rememberToken: null },
      });
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async authenticateAccessToken(token: string): Promise<AdminAuthUser> {
    const payload = this.verifyToken(token, 'access');
    const user = await this.findAdminUserById(payload.sub);
    const permissions = await this.getPermissions(user.id);
    this.assertHasAdminAccess(permissions);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions,
    };
  }

  async getCurrentAdmin(userId: number): Promise<AdminAuthUser> {
    const user = await this.findAdminUserById(userId);
    const permissions = await this.getPermissions(user.id);
    this.assertHasAdminAccess(permissions);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions,
    };
  }

  private async createSession(
    user: User,
    permissions: AdminPermission[],
    remember: boolean,
  ): Promise<SessionResponse> {
    const refreshExpiresIn = remember
      ? this.rememberRefreshTokenTtlSeconds
      : this.refreshTokenTtlSeconds;

    const accessToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        permissions,
      },
      'access',
      this.accessTokenTtlSeconds,
    );
    const refreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        remember,
      },
      'refresh',
      refreshExpiresIn,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        rememberToken: this.hashToken(refreshToken).toString('hex'),
        lastLoggedIn: new Date(),
        twoFactorCode: null,
        twoFactorExpiresAt: null,
      },
    });

    return {
      requiresTwoFactor: false,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        permissions,
      },
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn,
    };
  }

  private async findAdminUserByEmail(email: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      include: {
        adminAssignments: true,
      },
    });

    if (!user || !user.status || user.adminAssignments.length === 0) {
      throw new UnauthorizedException('The provided credentials do not match our records.');
    }

    return user;
  }

  private async findAdminUserById(id: number): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        adminAssignments: true,
      },
    });

    if (!user || !user.status || user.adminAssignments.length === 0) {
      throw new UnauthorizedException('Admin session is no longer valid.');
    }

    return user;
  }

  private async assertValidPassword(password: string, hash: string) {
    const matches = await compare(password, hash);
    if (!matches) {
      throw new UnauthorizedException('The provided credentials do not match our records.');
    }
  }

  private async getPermissions(userId: number): Promise<AdminPermission[]> {
    const assignments = await this.prisma.adminUserRolesPermission.findMany({
      where: { userId },
      include: {
        permission: true,
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();

    for (const assignment of assignments) {
      if (assignment.permission && assignment.permission.status !== 'hidden') {
        permissions.add(
          `${assignment.permission.module}.${assignment.permission.scope}.${assignment.permission.action}`,
        );
      }

      for (const rolePermission of assignment.role?.rolePermissions ?? []) {
        if (rolePermission.permission.status === 'hidden') {
          continue;
        }

        permissions.add(
          `${rolePermission.permission.module}.${rolePermission.permission.scope}.${rolePermission.permission.action}`,
        );
      }
    }

    return Array.from(permissions);
  }

  private assertHasAdminAccess(permissions: AdminPermission[]) {
    if (!permissions.length) {
      throw new UnauthorizedException('Admin session is missing permissions.');
    }
  }

  private signToken(
    input: Pick<AdminTokenPayload, 'sub' | 'email' | 'name' | 'permissions' | 'remember'>,
    type: AdminTokenType,
    ttlSeconds: number,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AdminTokenPayload = {
      sub: input.sub,
      email: input.email,
      name: input.name,
      permissions: input.permissions,
      type,
      iat: now,
      exp: now + ttlSeconds,
      jti: randomBytes(16).toString('hex'),
      remember:
        type === 'refresh' || type === 'two_factor'
          ? input.remember ?? false
          : undefined,
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

  private verifyToken(token: string, expectedType: AdminTokenType): AdminTokenPayload {
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
    ) as AdminTokenPayload;

    if (payload.type !== expectedType || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired or invalid.');
    }

    return payload;
  }

  private hashToken(token: string) {
    return createHmac('sha256', this.tokenSecret).update(token).digest();
  }

  private generateTwoFactorCode() {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }

  private async sendTwoFactorEmail(email: string, userName: string, code: string) {
    const smtp = await this.getSmtpConfig();

    if (!smtp.host || !smtp.port || !smtp.fromEmail) {
      throw new InternalServerErrorException('SMTP settings are incomplete.');
    }

    try {
      await sendSmtpMail(smtp, {
        to: email,
        subject: 'Admin Login: Your Verification Code',
        text: [
          `Hello ${userName},`,
          '',
          `Your verification code is: ${code}`,
          '',
          `This code expires in ${Math.ceil(this.twoFactorTtlSeconds / 60)} minutes.`,
        ].join('\n'),
        html: [
          `<p>Hello ${escapeHtml(userName)},</p>`,
          `<p>Your verification code is <strong style="font-size:20px; letter-spacing:2px;">${escapeHtml(code)}</strong></p>`,
          `<p>This code expires in ${Math.ceil(this.twoFactorTtlSeconds / 60)} minutes.</p>`,
        ].join(''),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : '';

      if (message.includes('535') || message.includes('invalid credentials')) {
        throw new InternalServerErrorException(
          'Unable to send verification code email. SMTP username or password is invalid.',
        );
      }

      throw new InternalServerErrorException(
        'Unable to send verification code email. Please verify SMTP settings.',
      );
    }
  }

  private async getSmtpConfig() {
    const keys = [
      'smtp_from_name',
      'smtp_from_email',
      'smtp_username',
      'smtp_password',
      'smtp_host',
      'smtp_port',
      'smtp_authentication',
    ];

    const rows = await this.prisma.serviceEnvironment.findMany({
      where: {
        key: { in: keys },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const map = Object.fromEntries(
      rows.map((row) => [row.key, row.value ?? '']),
    ) as Record<string, string>;
    const rawEncryption = String(map.smtp_authentication ?? '').trim().toLowerCase();

    const encryption: SmtpConfig['encryption'] =
      rawEncryption === 'none'
        ? 'none'
        : rawEncryption === 'ssl' || rawEncryption === 'ssl_tls' || rawEncryption === 'tls'
          ? 'ssl_tls'
          : 'starttls';

    return {
      host: map.smtp_host ?? '',
      port: Number(map.smtp_port ?? '0'),
      username: map.smtp_username ?? '',
      password: this.readStoredSmtpSecret(map.smtp_password),
      encryption,
      fromEmail: map.smtp_from_email ?? '',
      fromName: map.smtp_from_name ?? 'Telemed Admin',
    };
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (!local || !domain) {
      return email;
    }

    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
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

  private readStoredSmtpSecret(value: string | null | undefined) {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
      return '';
    }

    if (!looksLikeStoredEncryptedPayload(normalized)) {
      return normalized;
    }

    return decryptStoredString(normalized) ?? '';
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
