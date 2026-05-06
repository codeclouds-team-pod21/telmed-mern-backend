import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminAuthService } from '../admin-auth.service';

type RequestWithHeaders = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  admin?: unknown;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = this.extractAccessToken(request);

    if (!token) {
      throw new UnauthorizedException('Admin authentication required.');
    }

    request.admin = await this.adminAuthService.authenticateAccessToken(token);
    return true;
  }

  private extractAccessToken(request: RequestWithHeaders): string | null {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice(7).trim();
    }

    const cookies = request.headers.cookie ?? '';
    for (const part of cookies.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'tm_admin_access') {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }
}
