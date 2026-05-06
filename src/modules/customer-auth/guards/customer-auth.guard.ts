import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomerAuthService } from '../customer-auth.service';

type RequestWithHeaders = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  customer?: unknown;
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = this.extractAccessToken(request);

    if (!token) {
      throw new UnauthorizedException('Customer authentication required.');
    }

    request.customer = await this.customerAuthService.authenticateAccessToken(token);
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
      if (name === 'tm_customer_access') {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }
}
