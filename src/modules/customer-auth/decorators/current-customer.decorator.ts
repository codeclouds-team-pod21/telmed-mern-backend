import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerAuthUser } from '../customer-auth.types';

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerAuthUser | undefined => {
    const request = context.switchToHttp().getRequest<{ customer?: CustomerAuthUser }>();
    return request.customer;
  },
);
