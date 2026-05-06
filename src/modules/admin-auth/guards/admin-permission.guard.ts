import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSIONS_KEY } from '../decorators/admin-permissions.decorator';
import type { AdminAuthUser } from '../admin-auth.types';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ admin?: AdminAuthUser }>();

    const granted = request.admin?.permissions ?? [];
    const hasPermission = requiredPermissions.some((permission) =>
      granted.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return true;
  }
}
