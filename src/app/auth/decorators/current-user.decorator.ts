import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@saubio/models';
import type { AuthenticatedRequest } from '../types/authenticated-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authUser;
  }
);
