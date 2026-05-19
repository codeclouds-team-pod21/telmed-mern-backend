import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { SettingsService } from './settings.service';
import { UserSettingsMutationDto } from './dto/user-settings-mutation.dto';

@Controller('settings')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@AdminPermissions('settings.admin.settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getOverview() {
    return this.settingsService.getOverview();
  }

  @Get('system-info')
  getSystemInfo() {
    return this.settingsService.getSystemInfo();
  }

  @Get('crm')
  getCrmSettings() {
    return this.settingsService.getCrmSettings();
  }

  @Post('crm')
  saveCrmSettings(
    @Body()
    payload:
      | { action: 'create'; record: { enabled: boolean; provider: string; name: string; credentials: Record<string, string> } }
      | { action: 'update'; record: { id: number; enabled: boolean; provider: string; name: string; credentials: Record<string, string> } }
      | { action: 'delete'; id: number },
  ) {
    return this.settingsService.saveCrmSettings(payload);
  }

  @Get('doctor-networks')
  getDoctorNetworks() {
    return this.settingsService.getDoctorNetworksSettings();
  }

  @Post('doctor-networks')
  saveDoctorNetworks(
    @Body()
    payload:
      | { action: 'create'; record: { name: string; type: string; apiUrl: string; apiVersion?: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'update'; record: { id: number; name: string; type: string; apiUrl: string; apiVersion?: string; status: boolean; credentials?: Record<string, string> } }
      | { action: 'delete'; id: number },
  ) {
    return this.settingsService.saveDoctorNetworksSettings(payload);
  }

  @Get('customer-portal')
  getCustomerPortal() {
    return this.settingsService.getCustomerPortalSettings();
  }

  @Post('customer-portal')
  saveCustomerPortal(@Body() payload: {
    portalName: string;
    supportEmail: string;
    supportPhone: string;
    baseUrl: string;
    allowSelfService: boolean;
  }) {
    return this.settingsService.saveCustomerPortalSettings(payload);
  }

  @Get('smtp')
  getSmtpSettings() {
    return this.settingsService.getSmtpSettings();
  }

  @Post('smtp')
  saveSmtpSettings(@Body() payload: {
    host: string;
    port: string;
    username: string;
    password: string;
    encryption: string;
    fromName: string;
    fromEmail: string;
  }) {
    return this.settingsService.saveSmtpSettings(payload);
  }

  @Get('users')
  getUsers() {
    return this.settingsService.getUsersSettings();
  }

  @Post('users')
  saveUsers(@Body() dto: UserSettingsMutationDto) {
    return this.settingsService.saveUsersSettings(dto);
  }
}
