import type { Request } from 'express';
import type { User } from '@saubio/models';

export interface AuthenticatedRequest extends Request {
  authUser: User;
  user: {
    id: string;
    roles: User['roles'];
  };
}
