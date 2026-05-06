import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { access, statfs } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { UserSettingsMutationDto } from './dto/user-settings-mutation.dto';
import { decryptStoredFields, decryptStoredString, encryptStoredString } from '../../common/utils/encrypted-config.util';

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
    const permissions = await this.getPermissionsSnapshot();
    const resources = await this.getResourceSnapshot();
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
    const crm = await this.prisma.crm.findFirst({
      orderBy: { id: 'asc' },
    });

    if (!crm) {
      return {
        enabled: false,
        provider: 'vrio',
        name: 'Primary CRM',
        credentials: {
          connectionId: '',
          username: '',
          apiKey: '',
        },
        syncedAt: null,
      };
    }

    const credentials = decryptStoredFields(
      this.parseJson<Record<string, string>>(crm.credentials, {}),
      ['api_key', 'password'],
    );

    return {
      enabled: crm.status,
      provider: crm.type,
      name: crm.name,
      credentials: {
        connectionId: String(credentials.connection_id ?? ''),
        username: String(credentials.username ?? ''),
        apiKey: String(credentials.api_key ?? ''),
      },
      syncedAt: crm.updatedAt?.toISOString() ?? null,
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
        status: item.status,
        createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
        credentials: decryptStoredFields(
          this.parseJson<Record<string, string>>(item.credentials, {}),
          ['client_id', 'client_secret'],
        ),
      })),
    };
  }

  async getCustomerPortalSettings() {
    const config = await this.prisma.portalConfiguration.findFirst({
      orderBy: { id: 'asc' },
    });

    return {
      portalName: config?.portalName ?? 'Telemed Portal',
      supportEmail: config?.customerSupportEmail ?? '',
      supportPhone: config?.customerSupportPhone ?? '',
      baseUrl: process.env.APP_URL ?? 'http://localhost',
      allowSelfService:
        Boolean(config?.featureCancelTreatmentEnabled) ||
        Boolean(config?.featureRefillTreatmentEnabled) ||
        Boolean(config?.featureChangeTreatmentEnabled),
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
      password: decryptStoredString(rows.smtp_password ?? '') ?? '',
      encryption: rows.smtp_authentication ?? 'starttls',
      fromName: rows.smtp_from_name ?? '',
      fromEmail: rows.smtp_from_email ?? '',
    };
  }

  async saveCrmSettings(payload: {
    enabled: boolean;
    provider: string;
    name: string;
    credentials: Record<string, string>;
  }) {
    const existing = await this.prisma.crm.findFirst({
      orderBy: { id: 'asc' },
    });

    const existingCredentials = this.parseJson<Record<string, string>>(existing?.credentials, {});
    const nextCredentials: Record<string, string> = {
      connection_id: String(payload.credentials.connectionId ?? ''),
      username: String(payload.credentials.username ?? ''),
    };

    const nextApiKey = String(payload.credentials.apiKey ?? '').trim();
    if (nextApiKey) {
      nextCredentials.api_key = encryptStoredString(nextApiKey) ?? nextApiKey;
    } else if (existingCredentials.api_key) {
      nextCredentials.api_key = String(existingCredentials.api_key);
    }

    const now = new Date();

    if (existing) {
      await this.prisma.crm.update({
        where: { id: existing.id },
        data: {
          status: payload.enabled,
          type: payload.provider as 'vrio' | 'checkoutchamp',
          name: payload.name.trim() || 'Primary CRM',
          credentials: JSON.stringify(nextCredentials),
          updatedAt: now,
        },
      });
    } else {
      await this.prisma.crm.create({
        data: {
          status: payload.enabled,
          type: payload.provider as 'vrio' | 'checkoutchamp',
          name: payload.name.trim() || 'Primary CRM',
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
      | { action: 'create'; record: { name: string; type: string; apiUrl: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'update'; record: { id: number; name: string; type: string; apiUrl: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'delete'; id: number },
  ) {
    if (payload.action === 'create') {
      const now = new Date();
      await this.prisma.doctorNetwork.create({
        data: {
          name: payload.record.name.trim(),
          type: payload.record.type as 'mdi',
          apiUrl: payload.record.apiUrl.trim(),
          credentials: JSON.stringify(this.encryptDoctorNetworkCredentials(payload.record.credentials ?? {})),
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
          credentials: JSON.stringify(this.encryptDoctorNetworkCredentials(payload.record.credentials ?? {})),
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
    supportEmail: string;
    supportPhone: string;
    baseUrl: string;
    allowSelfService: boolean;
  }) {
    const existing = await this.prisma.portalConfiguration.findFirst({
      orderBy: { id: 'asc' },
    });

    const data = {
      portalName: payload.portalName.trim() || 'Telemed Portal',
      customerSupportEmail: payload.supportEmail.trim(),
      customerSupportPhone: payload.supportPhone.trim(),
      featureCancelTreatmentEnabled: payload.allowSelfService,
      featureChangeTreatmentEnabled: payload.allowSelfService,
      featureRefillTreatmentEnabled: payload.allowSelfService,
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
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();

    return {
      ramUsage: `${((usedMemory / totalMemory) * 100).toFixed(1)}%`,
      diskUsage: await this.getDiskUsage(),
      appVersion: process.env.npm_package_version ?? '0.1.0',
      runtimeUser: os.userInfo().username,
    };
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

  private toLabel(value: string) {
    return value
      .split(/[_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private encryptDoctorNetworkCredentials(credentials: Record<string, string>) {
    const next = { ...credentials };

    for (const key of ['client_id', 'client_secret']) {
      const value = String(next[key] ?? '').trim();
      if (value) {
        next[key] = encryptStoredString(value) ?? value;
      }
    }

    return next;
  }
}
