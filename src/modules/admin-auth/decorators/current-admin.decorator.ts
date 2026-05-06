import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminAuthUser } from '../admin-auth.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminAuthUser | undefined => {
    const request = context.switchToHttp().getRequest<{ admin?: AdminAuthUser }>();
    return request.admin;
  },
);
