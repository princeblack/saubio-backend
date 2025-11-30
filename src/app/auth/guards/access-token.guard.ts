import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import type { User } from '@saubio/models';

interface AccessTokenPayload {
  sub: string;
  roles: string[];
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('ACCESS_TOKEN_MISSING');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.get<string>('app.jwtAccessSecret'),
      });

      if (!payload.sub) {
        throw new UnauthorizedException('INVALID_ACCESS_TOKEN');
      }

      const user = await this.usersService.findOne(payload.sub);

      request.user = {
        id: user.id,
        roles: user.roles,
      };
      request.authUser = user;

      return true;
    } catch (error) {
      throw new UnauthorizedException('INVALID_ACCESS_TOKEN');
    }
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    const query = request.query as Record<string, unknown> | undefined;
    const queryToken = query?.['access_token'] ?? query?.['token'];
    if (typeof queryToken === 'string' && queryToken.trim().length) {
      return queryToken.trim();
    }

    const cookieHeader = request.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const match = cookieHeader
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith('access_token='));
      if (match) {
        return decodeURIComponent(match.split('=')[1] ?? '');
      }
    }

    return undefined;
  }
}
