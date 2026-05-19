import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { access, statfs } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { UserSettingsMutationDto } from './dto/user-settings-mutation.dto';
import {
  decryptStoredFields,
  decryptStoredString,
  encryptStoredString,
  isStoredCredentialDecryptionError,
  looksLikeStoredEncryptedPayload,
} from '../../common/utils/encrypted-config.util';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getOverview() {
    return {
      tabs: [
        { key: 'system-info', label: 'System Info' },
        { key: 'crm', label: 'CRM' },
        { key: 'doctor-networks', label: 'Doctor Networks' },
        { key: 'customer-portal', label: 'Customer Portal' },
        { key: 'smtp', label: 'SMTP' },
        { key: 'users', label: 'Users' },
      ],
    };
  }

  async getSystemInfo() {
    const [permissions, resources] = await Promise.all([
      this.getPermissionsSnapshot().catch(() => []),
      this.getResourceSnapshot().catch(() => ({
        ramUsage: 'Unavailable',
        diskUsage: 'Unavailable',
        appVersion: process.env.npm_package_version ?? '0.1.0',
        runtimeUser: 'Unavailable',
      })),
    ]);
    const databaseUrl = process.env.DATABASE_URL ?? '';
    const parsedDb = this.parseDatabaseUrl(databaseUrl);

    return {
      database: {
        engine: parsedDb.engine,
        host: parsedDb.host,
        name: parsedDb.name,
        username: parsedDb.username,
        port: parsedDb.port,
      },
      runtime: {
        version: 'Migrated via Nest backend',
        extensions: [
          { name: 'node:crypto', enabled: true },
          { name: 'node:fs', enabled: true },
          { name: 'prisma', enabled: true },
          { name: 'cors', enabled: true },
        ],
      },
      permissions,
      resources,
    };
  }

  async getCrmSettings() {
    const items = await this.prisma.crm.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      items: items.map((crm: any) => {
        const credentials = this.decryptStoredRecordOrThrow(
          this.parseJsonRecord(crm.credentials),
          ['api_key', 'password'],
          'CRM credentials could not be decrypted. CONFIG_ENCRYPTION_KEY does not match the key used when the credentials were saved. Re-save the CRM credentials in settings or restore the original encryption key.',
        );

        return {
          id: crm.id,
          enabled: crm.status,
          provider: crm.type,
          name: crm.name,
          createdAt: crm.createdAt?.toISOString() ?? null,
          syncedAt: crm.updatedAt?.toISOString() ?? null,
          credentials: {
            connectionId: String(
              credentials.connection_id ?? credentials.connectionId ?? '',
            ),
            username: String(credentials.username ?? ''),
            apiKey: String(credentials.api_key ?? credentials.apiKey ?? ''),
          },
        };
      }),
    };
  }

  async getDoctorNetworksSettings() {
    const items = await this.prisma.doctorNetwork.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      items: items.map((item:any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        apiUrl: item.apiUrl,
        apiVersion: item.apiVersion ?? '',
        status: item.status,
        createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
        credentials: this.mapDoctorNetworkCredentialsForView(item.credentials),
      })),
    };
  }

  async getCustomerPortalSettings() {
    const config = await this.prisma.portalConfiguration.findFirst({
      orderBy: { id: 'asc' },
    });

    const cancelMetadata = this.parsePortalCancelTreatmentMetadata(
      config?.featureCancelTreatmentMetadata,
    );

    return {
      portalName: config?.portalName ?? 'Telemed Portal',
      requireTwoFactor: Boolean(config?.require2fa),
      supportRoutingEmails: this.parsePortalStringArray(
        config?.supportRoutingEmails,
      ),
      supportEmail: config?.customerSupportEmail ?? '',
      supportPhone: config?.customerSupportPhone ?? '',
      phoneCountryCode: config?.phoneCountryCode ?? 'US',
      businessAddress: config?.businessAddress ?? '',
      businessHours: config?.businessHours ?? '',
      baseUrl: process.env.APP_URL ?? 'http://localhost',
      features: {
        cancelTreatmentEnabled: Boolean(config?.featureCancelTreatmentEnabled),
        changeTreatmentEnabled: Boolean(config?.featureChangeTreatmentEnabled),
        changeRefillDateEnabled: Boolean(config?.featureChangeRefillDateEnabled),
        refillTreatmentEnabled: Boolean(config?.featureRefillTreatmentEnabled),
        cancelTreatmentMetadata: cancelMetadata,
      },
      customization: {
        logoPath: config?.logoPath ?? '',
        faviconPath: config?.faviconPath ?? '',
        colors: {
          primaryColor: config?.primaryColor ?? '#5C79FF',
          bodyBgColor: config?.bodyBgColor ?? '#F8F9FA',
          headerBgColor: config?.headerBgColor ?? '#212D3D',
          navMenuColor: config?.navMenuColor ?? '#FFFFFF',
          primaryTextColor: config?.primaryTextColor ?? '#212D3D',
          secondaryTextColor: config?.secondaryTextColor ?? '#5E6473',
          headerTextColor: config?.headerTextColor ?? '#FFFFFF',
          borderColor: config?.borderColor ?? '#E4ECF2',
          iconColor: config?.iconColor ?? '#A0A4B1',
        },
      },
      navigationMenu: this.parsePortalNavigationMenu(config?.navigationMenu),
    };
  }

  async getSmtpSettings() {
    const rows = await this.getServiceEnvironmentMap([
      'smtp_from_name',
      'smtp_from_email',
      'smtp_username',
      'smtp_password',
      'smtp_host',
      'smtp_port',
      'smtp_authentication',
    ]);

    return {
      host: rows.smtp_host ?? '',
      port: rows.smtp_port ?? '',
      username: rows.smtp_username ?? '',
      password: this.readStoredSmtpSecret(rows.smtp_password),
      encryption: rows.smtp_authentication ?? 'starttls',
      fromName: rows.smtp_from_name ?? '',
      fromEmail: rows.smtp_from_email ?? '',
    };
  }

  async saveCrmSettings(
    payload:
      | { action: 'create'; record: { enabled: boolean; provider: string; name: string; credentials: Record<string, string> } }
      | { action: 'update'; record: { id: number; enabled: boolean; provider: string; name: string; credentials: Record<string, string> } }
      | { action: 'delete'; id: number },
  ) {
    if (payload.action === 'delete') {
      const existing = await this.prisma.crm.findUnique({
        where: { id: payload.id },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException('CRM not found.');
      }

      await this.prisma.crm.delete({
        where: { id: payload.id },
      });

      return this.getCrmSettings();
    }

    const existing =
      payload.action === 'update'
        ? await this.prisma.crm.findUnique({
            where: { id: payload.record.id },
          })
        : null;

    if (payload.action === 'update' && !existing) {
      throw new NotFoundException('CRM not found.');
    }

    const record = payload.record;
    const existingCredentials = this.parseJsonRecord(existing?.credentials);
    const nextCredentials: Record<string, string> = {
      connection_id: String(record.credentials.connectionId ?? ''),
      username: String(record.credentials.username ?? ''),
    };

    const nextApiKey = String(record.credentials.apiKey ?? '').trim();
    if (nextApiKey) {
      nextCredentials.api_key = encryptStoredString(nextApiKey) ?? nextApiKey;
    } else if (existingCredentials.api_key || existingCredentials.apiKey) {
      nextCredentials.api_key = String(
        existingCredentials.api_key ?? existingCredentials.apiKey,
      );
    }

    const now = new Date();

    if (existing) {
      await this.prisma.crm.update({
        where: { id: existing.id },
        data: {
          status: record.enabled,
          type: record.provider as 'vrio' | 'checkoutchamp',
          name: record.name.trim() || 'Primary CRM',
          credentials: JSON.stringify(nextCredentials),
          updatedAt: now,
        },
      });
    } else {
      await this.prisma.crm.create({
        data: {
          status: record.enabled,
          type: record.provider as 'vrio' | 'checkoutchamp',
          name: record.name.trim() || 'Primary CRM',
          credentials: JSON.stringify(nextCredentials),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    return this.getCrmSettings();
  }

  async saveDoctorNetworksSettings(
    payload:
      | { action: 'create'; record: { name: string; type: string; apiUrl: string; apiVersion?: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'update'; record: { id: number; name: string; type: string; apiUrl: string; apiVersion?: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'delete'; id: number },
  ) {
    if (payload.action === 'create') {
      const now = new Date();
      await this.prisma.doctorNetwork.create({
        data: {
          name: payload.record.name.trim(),
          type: payload.record.type as 'mdi',
          apiUrl: payload.record.apiUrl.trim(),
          apiVersion: payload.record.apiVersion?.trim() || null,
          credentials: JSON.stringify(
            this.encryptDoctorNetworkCredentials(payload.record.credentials ?? {}),
          ),
          introVideoStates: '[]',
          status: payload.record.status,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    if (payload.action === 'update') {
      const existing = await this.prisma.doctorNetwork.findUnique({
        where: { id: payload.record.id },
      });

      if (!existing) {
        throw new NotFoundException('Doctor network not found.');
      }

      await this.prisma.doctorNetwork.update({
        where: { id: payload.record.id },
        data: {
          name: payload.record.name.trim(),
          type: payload.record.type as 'mdi',
          apiUrl: payload.record.apiUrl.trim(),
          apiVersion: payload.record.apiVersion?.trim() || null,
          credentials: JSON.stringify(
            this.encryptDoctorNetworkCredentials(
              payload.record.credentials ?? {},
              this.parseJsonRecord(existing.credentials),
            ),
          ),
          status: payload.record.status,
          updatedAt: new Date(),
        },
      });
    }

    if (payload.action === 'delete') {
      const existing = await this.prisma.doctorNetwork.findUnique({
        where: { id: payload.id },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException('Doctor network not found.');
      }

      await this.prisma.doctorNetwork.delete({
        where: { id: payload.id },
      });
    }

    return this.getDoctorNetworksSettings();
  }

  async saveCustomerPortalSettings(payload: {
    portalName: string;
    requireTwoFactor: boolean;
    supportRoutingEmails: string[];
    supportEmail: string;
    supportPhone: string;
    phoneCountryCode: string;
    businessAddress: string;
    businessHours: string;
    baseUrl: string;
    features: {
      cancelTreatmentEnabled: boolean;
      changeTreatmentEnabled: boolean;
      changeRefillDateEnabled: boolean;
      refillTreatmentEnabled: boolean;
      cancelTreatmentMetadata?: {
        cancellationOffer?: {
          enabled?: boolean;
          discountAmount?: string;
        };
        automaticApprovals?: {
          enabled?: boolean;
          type?: string;
          delayDays?: string;
        };
      };
    };
    customization: {
      logoPath: string;
      faviconPath: string;
      colors: {
        primaryColor: string;
        bodyBgColor: string;
        headerBgColor: string;
        navMenuColor: string;
        primaryTextColor: string;
        secondaryTextColor: string;
        headerTextColor: string;
        borderColor: string;
        iconColor: string;
      };
    };
    navigationMenu: Array<{
      label: string;
      route: string;
      path: string;
      isVisible: boolean;
      activeOn?: string[];
      badge?: number | null;
    }>;
  }) {
    const existing = await this.prisma.portalConfiguration.findFirst({
      orderBy: { id: 'asc' },
    });

    const normalizedRoutingEmails = Array.from(
      new Set(
        (payload.supportRoutingEmails ?? [])
          .map((email) => String(email ?? '').trim())
          .filter(Boolean),
      ),
    );
    const normalizedMenu = (payload.navigationMenu ?? [])
      .map((item) => ({
        label: String(item.label ?? '').trim(),
        route: String(item.route ?? '').trim(),
        path: String(item.path ?? '').trim(),
        is_visible: Boolean(item.isVisible),
        active_on: Array.isArray(item.activeOn)
          ? item.activeOn
              .map((entry) => String(entry ?? '').trim())
              .filter(Boolean)
          : [],
        ...(typeof item.badge === 'number' ? { badge: item.badge } : {}),
      }))
      .filter((item) => item.label && item.route && item.path);
    const normalizedCancelMetadata = {
      cancellation_offer: {
        enabled: Boolean(
          payload.features?.cancelTreatmentMetadata?.cancellationOffer?.enabled,
        ),
        discount_amount:
          String(
            payload.features?.cancelTreatmentMetadata?.cancellationOffer
              ?.discountAmount ?? '',
          ).trim() || null,
      },
      automatic_approvals: {
        enabled: Boolean(
          payload.features?.cancelTreatmentMetadata?.automaticApprovals?.enabled,
        ),
        type:
          String(
            payload.features?.cancelTreatmentMetadata?.automaticApprovals
              ?.type ?? 'immediately',
          ).trim() || 'immediately',
        delay_days:
          String(
            payload.features?.cancelTreatmentMetadata?.automaticApprovals
              ?.delayDays ?? '',
          ).trim() || null,
      },
    };

    const data = {
      portalName: payload.portalName.trim() || 'Telemed Portal',
      require2fa: Boolean(payload.requireTwoFactor),
      supportRoutingEmails: JSON.stringify(normalizedRoutingEmails),
      customerSupportEmail: payload.supportEmail.trim(),
      customerSupportPhone: payload.supportPhone.trim(),
      phoneCountryCode: payload.phoneCountryCode.trim() || 'US',
      businessAddress: payload.businessAddress.trim(),
      businessHours: payload.businessHours.trim(),
      featureCancelTreatmentEnabled: Boolean(
        payload.features?.cancelTreatmentEnabled,
      ),
      featureCancelTreatmentMetadata: JSON.stringify(normalizedCancelMetadata),
      featureChangeTreatmentEnabled: Boolean(
        payload.features?.changeTreatmentEnabled,
      ),
      featureChangeRefillDateEnabled: Boolean(
        payload.features?.changeRefillDateEnabled,
      ),
      featureRefillTreatmentEnabled: Boolean(
        payload.features?.refillTreatmentEnabled,
      ),
      navigationMenu: JSON.stringify(
        normalizedMenu.length
          ? normalizedMenu
          : this.getDefaultPortalNavigationMenu(),
      ),
      logoPath: payload.customization?.logoPath?.trim() || null,
      faviconPath: payload.customization?.faviconPath?.trim() || null,
      primaryColor:
        payload.customization?.colors?.primaryColor?.trim() || '#5C79FF',
      bodyBgColor:
        payload.customization?.colors?.bodyBgColor?.trim() || '#F8F9FA',
      headerBgColor:
        payload.customization?.colors?.headerBgColor?.trim() || '#212D3D',
      navMenuColor:
        payload.customization?.colors?.navMenuColor?.trim() || '#FFFFFF',
      primaryTextColor:
        payload.customization?.colors?.primaryTextColor?.trim() || '#212D3D',
      secondaryTextColor:
        payload.customization?.colors?.secondaryTextColor?.trim() || '#5E6473',
      headerTextColor:
        payload.customization?.colors?.headerTextColor?.trim() || '#FFFFFF',
      borderColor:
        payload.customization?.colors?.borderColor?.trim() || '#E4ECF2',
      iconColor:
        payload.customization?.colors?.iconColor?.trim() || '#A0A4B1',
      updatedAt: new Date(),
    };

    if (existing) {
      await this.prisma.portalConfiguration.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.portalConfiguration.create({
        data: {
          ...data,
          createdAt: new Date(),
        },
      });
    }

    return this.getCustomerPortalSettings();
  }

  async saveSmtpSettings(payload: {
    host: string;
    port: string;
    username: string;
    password: string;
    encryption: string;
    fromName: string;
    fromEmail: string;
  }) {
    const entries: Array<[string, string]> = [
      ['smtp_from_name', payload.fromName.trim()],
      ['smtp_from_email', payload.fromEmail.trim()],
      ['smtp_username', payload.username.trim()],
      ['smtp_password', encryptStoredString(payload.password) ?? payload.password],
      ['smtp_host', payload.host.trim()],
      ['smtp_port', payload.port.trim()],
      ['smtp_authentication', payload.encryption.trim()],
    ];

    for (const [key, value] of entries) {
      await this.prisma.serviceEnvironment.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    return this.getSmtpSettings();
  }

  async getUsersSettings() {
    const permissions = await this.prisma.adminPermission.findMany({
      where: {
        scope: 'admin',
        status: {
          not: 'hidden',
        },
      },
      include: {
        actionRef: true,
      },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    const roles = await this.prisma.adminRole.findMany({
      where: {
        status: {
          not: '0',
        },
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalPermissions = permissions.length;

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        adminAssignments: {
          some: {},
        },
      },
      include: {
        adminAssignments: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    return {
      items: users.map((user:any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        roleId: user.adminAssignments.find((item:any) => item.roleId)?.roleId ?? 0,
        role: user.adminAssignments.find((item:any) => item.role)?.role?.name ?? 'N/A',
        status: user.status ? 'Active' : 'Inactive',
        twoFactorEnabled: user.twoFactorEnabled,
        authorizationType: 'Role',
        lastLoggedIn: user.lastLoggedIn?.toISOString() ?? null,
      })),
      roles: roles.map((role:any) => ({
        id: role.id,
        name: role.name,
        description: role.description ?? '',
        permissionCount: role.rolePermissions.filter(
          (entry:any) => entry.permission.scope === 'admin' && entry.permission.status !== 'hidden',
        ).length,
        totalPermissionCount: totalPermissions,
        permissionIds: role.rolePermissions
          .filter((entry:any) => entry.permission.scope === 'admin' && entry.permission.status !== 'hidden')
          .map((entry:any) => entry.permissionId),
        createdAt: role.createdAt?.toISOString() ?? null,
        status: role.status !== '0',
      })),
      permissions: permissions.map((permission:any) => ({
        id: permission.id,
        module: permission.module,
        scope: permission.scope,
        action: permission.action,
        key: `${permission.module}.${permission.scope}.${permission.action}`,
        label: permission.actionRef?.label ?? this.toLabel(permission.action),
      })),
    };
  }

  async saveUsersSettings(dto: UserSettingsMutationDto) {
    if (dto.action === 'create') {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: dto.record.email,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('A user with this email already exists.');
      }

      const user = await this.prisma.user.create({
        data: {
          name: dto.record.name.trim(),
          email: dto.record.email.trim().toLowerCase(),
          phoneNumber: dto.record.phoneNumber?.trim() || null,
          password: await hash(dto.record.password, 10),
          status: dto.record.status === 'Active',
          twoFactorEnabled: dto.record.twoFactorEnabled,
          adminAssignments: {
            create: {
              roleId: dto.record.roleId,
            },
          },
        },
      });

      if (!user) {
        throw new ConflictException('Unable to create user.');
      }
    }

    if (dto.action === 'update') {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: dto.record.email,
          deletedAt: null,
          id: { not: dto.record.id },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('A user with this email already exists.');
      }

      await this.prisma.user.update({
        where: { id: dto.record.id },
        data: {
          name: dto.record.name.trim(),
          email: dto.record.email.trim().toLowerCase(),
          phoneNumber: dto.record.phoneNumber?.trim() || null,
          status: dto.record.status === 'Active',
          twoFactorEnabled: dto.record.twoFactorEnabled,
          ...(dto.record.password?.trim()
            ? { password: await hash(dto.record.password.trim(), 10) }
            : {}),
        },
      });

      await this.prisma.adminUserRolesPermission.deleteMany({
        where: {
          userId: dto.record.id,
          roleId: {
            not: null,
          },
        },
      });

      await this.prisma.adminUserRolesPermission.create({
        data: {
          userId: dto.record.id,
          roleId: dto.record.roleId,
        },
      });
    }

    if (dto.action === 'delete') {
      const existing = await this.prisma.user.findFirst({
        where: {
          id: dto.id,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException('User not found.');
      }

      await this.prisma.user.update({
        where: { id: dto.id },
        data: {
          deletedAt: new Date(),
          rememberToken: null,
        },
      });
    }

    if (dto.action === 'create-role') {
      const name = dto.record.name.trim();

      const existingRole = await this.prisma.adminRole.findFirst({
        where: {
          name,
          status: {
            not: '0',
          },
        },
        select: { id: true },
      });

      if (existingRole) {
        throw new ConflictException('A role with this name already exists.');
      }

      const permissionIds = [...new Set(dto.record.permissionIds)];

      if (permissionIds.length) {
        const matchingPermissions = await this.prisma.adminPermission.findMany({
          where: {
            id: {
              in: permissionIds,
            },
            scope: 'admin',
            status: {
              not: 'hidden',
            },
          },
          select: { id: true },
        });

        if (matchingPermissions.length !== permissionIds.length) {
          throw new NotFoundException('One or more selected permissions are unavailable.');
        }
      }

      const now = new Date();

      await this.prisma.adminRole.create({
        data: {
          name,
          description: '',
          status: '1',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          rolePermissions: permissionIds.length
            ? {
                create: permissionIds.map((permissionId) => ({
                  permissionId,
                  updatedAt: now,
                })),
              }
            : undefined,
        },
      });
    }

    return this.getUsersSettings();
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private parseJsonRecord(value: string | null | undefined): Record<string, string> {
    if (!value) {
      return {};
    }

    let current: unknown = value;

    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current !== 'string') {
        break;
      }

      const trimmed = current.trim();
      if (!trimmed) {
        return {};
      }

      try {
        current = JSON.parse(trimmed);
      } catch {
        return {};
      }
    }

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).map(([key, entry]) => [key, String(entry ?? '')]),
    );
  }

  private async getServiceEnvironmentMap(keys: string[]) {
    try {
      const rows = await this.prisma.serviceEnvironment.findMany({
        where: {
          key: { in: keys },
        },
        select: {
          key: true,
          value: true,
        },
      });

      return Object.fromEntries(
        rows.map((row) => [row.key, row.value ?? '']),
      ) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }

  private parseDatabaseUrl(url: string) {
    try {
      const parsed = new URL(url);
      return {
        engine: parsed.protocol.replace(':', ''),
        host: parsed.hostname,
        name: parsed.pathname.replace(/^\//, ''),
        username: parsed.username,
        port: parsed.port || '3306',
      };
    } catch {
      return {
        engine: 'mysql',
        host: '127.0.0.1',
        name: 'telemed',
        username: 'root',
        port: '3306',
      };
    }
  }

  private async getPermissionsSnapshot() {
    try {
      const root = process.cwd();
      const targets = [
        { name: '.env', filePath: path.join(root, '.env') },
        { name: 'src', filePath: path.join(root, 'src') },
        { name: 'prisma', filePath: path.join(root, 'prisma') },
        { name: 'dist', filePath: path.join(root, 'dist') },
      ];

      return Promise.all(
        targets.map(async (target) => ({
          name: target.name,
          readable: await this.hasAccess(target.filePath, false),
          writable: await this.hasAccess(target.filePath, true),
        })),
      );
    } catch {
      return [
        { name: '.env', readable: false, writable: false },
        { name: 'src', readable: false, writable: false },
        { name: 'prisma', readable: false, writable: false },
        { name: 'dist', readable: false, writable: false },
      ];
    }
  }

  private async hasAccess(filePath: string, write: boolean) {
    try {
      await access(filePath, write ? 6 : 4);
      return true;
    } catch {
      return false;
    }
  }

  private async getResourceSnapshot() {
    try {
      const totalMemory = os.totalmem();
      const usedMemory = totalMemory - os.freemem();

      return {
        ramUsage: totalMemory > 0 ? `${((usedMemory / totalMemory) * 100).toFixed(1)}%` : 'Unavailable',
        diskUsage: await this.getDiskUsage(),
        appVersion: process.env.npm_package_version ?? '0.1.0',
        runtimeUser: this.getRuntimeUser(),
      };
    } catch {
      return {
        ramUsage: 'Unavailable',
        diskUsage: 'Unavailable',
        appVersion: process.env.npm_package_version ?? '0.1.0',
        runtimeUser: 'Unavailable',
      };
    }
  }

  private async getDiskUsage() {
    try {
      const stats = await statfs(process.cwd());
      const total = Number(stats.blocks) * Number(stats.bsize);
      const available = Number(stats.bavail) * Number(stats.bsize);

      if (total <= 0) {
        return 'Unavailable';
      }

      return `${(((total - available) / total) * 100).toFixed(1)}%`;
    } catch {
      return 'Unavailable';
    }
  }

  private getRuntimeUser() {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USERNAME ?? process.env.USER ?? 'Unavailable';
    }
  }

  private toLabel(value: string) {
    return value
      .split(/[_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private decryptStoredRecordOrThrow(
    value: Record<string, string>,
    keys: string[],
    failureMessage: string,
  ) {
    try {
      return decryptStoredFields(value, keys);
    } catch (error) {
      const hasEncryptedValue = keys.some((key) =>
        looksLikeStoredEncryptedPayload(String(value[key] ?? '').trim()),
      );

      if (hasEncryptedValue && isStoredCredentialDecryptionError(error)) {
        throw new BadRequestException(failureMessage);
      }

      throw error;
    }
  }

  private mapDoctorNetworkCredentialsForView(
    value: string | null | undefined,
  ): Record<string, string> {
    const decrypted = this.decryptStoredRecordOrThrow(
      this.parseJsonRecord(value),
      ['client_id', 'client_secret', 'clientId', 'clientSecret'],
      'Doctor network credentials could not be decrypted. CONFIG_ENCRYPTION_KEY does not match the key used when the credentials were saved. Re-save the credentials in settings or restore the original encryption key.',
    );
    const clientId = String(
      decrypted.client_id ?? decrypted.clientId ?? '',
    ).trim();
    const clientSecret = String(
      decrypted.client_secret ?? decrypted.clientSecret ?? '',
    ).trim();

    return {
      ...Object.fromEntries(
        Object.entries(decrypted).map(([key, item]) => [key, String(item ?? '')]),
      ),
      client_id: clientId,
      client_secret: clientSecret,
      clientId,
      clientSecret,
    };
  }

  private encryptDoctorNetworkCredentials(
    credentials: Record<string, string>,
    existing: Record<string, string> = {},
  ) {
    const next = {
      ...existing,
      ...credentials,
    };

    const clientId = String(
      credentials.client_id ?? credentials.clientId ?? '',
    ).trim();
    const clientSecret = String(
      credentials.client_secret ?? credentials.clientSecret ?? '',
    ).trim();
    const existingClientId = String(
      existing.client_id ?? existing.clientId ?? '',
    ).trim();
    const existingClientSecret = String(
      existing.client_secret ?? existing.clientSecret ?? '',
    ).trim();

    const normalizedClientId = clientId || existingClientId;
    const normalizedClientSecret = clientSecret || existingClientSecret;

    delete next.clientId;
    delete next.clientSecret;
    next.client_id = normalizedClientId;
    next.client_secret = normalizedClientSecret;

    for (const key of ['client_id', 'client_secret'] as const) {
      const value = String(next[key] ?? '').trim();
      if (value) {
        const existingValue = String(
          existing[key] ??
            existing[key === 'client_id' ? 'clientId' : 'clientSecret'] ??
            '',
        ).trim();
        next[key] =
          value === existingValue
            ? existingValue
            : (encryptStoredString(value) ?? value);
      }
    }

    return next;
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

  private parsePortalStringArray(value: string | null | undefined) {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item ?? '').trim())
          .filter(Boolean);
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private parsePortalCancelTreatmentMetadata(value: string | null | undefined) {
    const fallback = {
      cancellationOffer: {
        enabled: false,
        discountAmount: '',
      },
      automaticApprovals: {
        enabled: false,
        type: 'immediately',
        delayDays: '',
      },
    };

    if (!value) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(value) as Record<string, any>;
      return {
        cancellationOffer: {
          enabled: Boolean(parsed?.cancellation_offer?.enabled),
          discountAmount: String(
            parsed?.cancellation_offer?.discount_amount ?? '',
          ),
        },
        automaticApprovals: {
          enabled: Boolean(parsed?.automatic_approvals?.enabled),
          type:
            String(parsed?.automatic_approvals?.type ?? 'immediately') ||
            'immediately',
          delayDays: String(
            parsed?.automatic_approvals?.delay_days ?? '',
          ),
        },
      };
    } catch {
      return fallback;
    }
  }

  private parsePortalNavigationMenu(value: string | null | undefined) {
    if (!value) {
      return this.getDefaultPortalNavigationMenu().map((item) =>
        this.mapPortalNavigationItem(item),
      );
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) =>
          this.mapPortalNavigationItem(item as Record<string, unknown>),
        );
      }
    } catch {
      return this.getDefaultPortalNavigationMenu().map((item) =>
        this.mapPortalNavigationItem(item),
      );
    }

    return this.getDefaultPortalNavigationMenu().map((item) =>
      this.mapPortalNavigationItem(item),
    );
  }

  private mapPortalNavigationItem(item: Record<string, unknown>) {
    return {
      label: String(item.label ?? '').trim(),
      route: String(item.route ?? '').trim(),
      path: String(item.path ?? '').trim(),
      isVisible: Boolean(item.is_visible ?? item.isVisible ?? true),
      activeOn: Array.isArray(item.active_on)
        ? item.active_on.map((entry) => String(entry ?? '').trim()).filter(Boolean)
        : [],
      badge:
        typeof item.badge === 'number'
          ? item.badge
          : item.badge == null
            ? null
            : Number(item.badge),
    };
  }

  private getDefaultPortalNavigationMenu() {
    return [
      {
        label: 'MY TREATMENTS',
        route: 'dashboard.view',
        path: '/dashboard',
        is_visible: true,
        active_on: ['dashboard.view', 'dashboard.details'],
      },
      {
        label: 'ORDER HISTORY',
        route: 'orders.view',
        path: '/orders',
        is_visible: true,
        active_on: ['orders.view', 'orders.details'],
      },
      {
        label: 'MY ACCOUNT',
        route: 'myaccount.view',
        path: '/my-account',
        is_visible: true,
      },
      {
        label: 'MEDICAL ADVISORY',
        route: 'medical.advisory',
        path: '/medical-advisory',
        is_visible: true,
        badge: 1,
      },
      {
        label: 'SUPPORT',
        route: 'support.view',
        path: '/support',
        is_visible: true,
      },
    ];
  }
}
