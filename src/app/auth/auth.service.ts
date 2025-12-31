import { Inject, Injectable, Logger, UnauthorizedException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { UsersService } from '../users/users.service';
import { AppleOAuthDto, GoogleOAuthDto, LoginDto, RefreshTokenDto, RegisterDto } from './dto';
import { User } from '@saubio/models';
import { RefreshTokensService } from './refresh-tokens.service';
import { EmailQueueService } from '../notifications/email-queue.service';
import type { AppEnvironmentConfig } from '../config/configuration';
import { SecurityService } from '../security/security.service';

interface AuthTokenPayload {
  sub: string;
  roles: string[];
}

interface RefreshPayload extends AuthTokenPayload {
  jti: string;
}

interface IssueContext {
  request?: Request;
}

@Injectable()
export class AuthService {
  private readonly maxRefreshTokens: number;
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly emailQueue: EmailQueueService,
    @Inject(forwardRef(() => SecurityService))
    private readonly security: SecurityService,
  ) {
    const configured = Number(this.configService.get<number>('app.maxRefreshTokens'));
    this.maxRefreshTokens = Number.isFinite(configured) && configured > 0 ? configured : 5;
  }

  async register(payload: RegisterDto, request?: Request) {
    const existing = await this.usersService.findByEmail(payload.email);

    if (existing) {
      throw new UnauthorizedException('EMAIL_ALREADY_REGISTERED');
    }

    const hashedPassword = await bcrypt.hash(payload.password, 12);

    const user = await this.usersService.create(
      {
        email: payload.email,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
        roles: payload.roles,
        preferredLocale: payload.preferredLocale,
        isActive: true,
      },
      hashedPassword,
    );

    if (user.roles.includes('client') || user.roles.includes('company')) {
      await this.sendClientWelcomeEmail(user);
    }

    return this.issueTokens(user, { request });
  }

  async login({ email, password }: LoginDto, request?: Request) {
    const ipAddress = this.extractIp(request);
    const userAgent = request?.headers['user-agent'] as string | undefined;
    const sanitizedEmail = email.toLowerCase();
    const record = await this.usersService.findByEmailWithSensitiveData(sanitizedEmail);

    if (!record || !record.hashedPassword) {
      await this.security.recordLoginAttempt({
        email: sanitizedEmail,
        success: false,
        reason: 'INVALID_CREDENTIALS',
        provider: 'password',
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, record.hashedPassword);

    if (!passwordMatches) {
      await this.security.recordLoginAttempt({
        email: sanitizedEmail,
        userId: record.id,
        userRole: this.pickPrimaryRole(record.roles ?? []),
        success: false,
        reason: 'INVALID_CREDENTIALS',
        provider: 'password',
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const user = await this.usersService.findOne(record.id);

    await this.security.recordLoginAttempt({
      email: user.email,
      userId: user.id,
      userRole: this.pickPrimaryRole(user.roles),
      success: true,
      reason: 'PASSWORD_LOGIN',
      provider: 'password',
      ipAddress,
      userAgent,
    });

    return this.issueTokens(user, { request });
  }

  async refresh(payload: RefreshTokenDto, request?: Request) {
    const refreshSecret = this.configService.get<string>('app.jwtRefreshSecret');
    if (!refreshSecret) {
      throw new UnauthorizedException('REFRESH_NOT_CONFIGURED');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<RefreshPayload>(payload.refreshToken, {
        secret: refreshSecret,
      });

      if (!decoded.jti) {
        throw new UnauthorizedException('MISSING_REFRESH_ID');
      }

      const tokenRecord = await this.refreshTokensService.validate(
        decoded.jti,
        decoded.sub,
        payload.refreshToken,
      );

      if (!tokenRecord) {
        throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
      }

      await this.refreshTokensService.revoke(decoded.jti);

      const user = await this.usersService.findOne(decoded.sub);
      return this.issueTokens(user, { request });
    } catch (error) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }
  }

  async logout(payload: RefreshTokenDto) {
    const refreshSecret = this.configService.get<string>('app.jwtRefreshSecret');
    if (!refreshSecret) {
      return { success: true };
    }

    try {
      const decoded = await this.jwtService.verifyAsync<RefreshPayload>(payload.refreshToken, {
        secret: refreshSecret,
      });
      if (decoded.jti) {
        await this.refreshTokensService.revoke(decoded.jti);
      }
    } catch (error) {
      // ignore invalid tokens during logout to avoid leaking information
    }

    return { success: true };
  }

  async loginWithGoogle(payload: GoogleOAuthDto, request?: Request) {
    const googleClientId = this.configService.get<string>('app.googleClientId');
    if (!googleClientId) {
      throw new UnauthorizedException('GOOGLE_AUTH_DISABLED');
    }
    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(googleClientId);
    }
    let attemptedEmail: string | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: payload.idToken,
        audience: googleClientId,
      });
      const googlePayload = ticket.getPayload();
      if (!googlePayload?.email) {
        throw new UnauthorizedException('GOOGLE_EMAIL_REQUIRED');
      }
      attemptedEmail = googlePayload.email;
      const profile = {
        email: googlePayload.email,
        firstName: googlePayload.given_name ?? googlePayload.email.split('@')[0],
        lastName: googlePayload.family_name ?? undefined,
        preferredLocale: this.normalizeLocale(googlePayload.locale),
      };
      const tokens = await this.handleOAuthLogin(profile, request);
      await this.security.recordLoginAttempt({
        email: profile.email,
        userId: tokens.user.id,
        userRole: this.pickPrimaryRole(tokens.user.roles),
        success: true,
        reason: 'GOOGLE_OAUTH',
        provider: 'google',
        ipAddress: this.extractIp(request),
        userAgent: request?.headers['user-agent'] as string | undefined,
      });
      return tokens;
    } catch (error) {
      if (attemptedEmail || payload?.idToken) {
        await this.security.recordLoginAttempt({
          email: attemptedEmail ?? 'unknown@google',
          success: false,
          reason: 'GOOGLE_AUTH_FAILED',
          provider: 'google',
          ipAddress: this.extractIp(request),
          userAgent: request?.headers['user-agent'] as string | undefined,
        });
      }
      this.logger.warn(`Google OAuth failed: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('GOOGLE_AUTH_FAILED');
    }
  }

  async loginWithApple(payload: AppleOAuthDto, request?: Request) {
    const appleClientId = this.configService.get<string>('app.appleClientId');
    if (!appleClientId) {
      throw new UnauthorizedException('APPLE_AUTH_DISABLED');
    }
    try {
      const applePayload = (await appleSignin.verifyIdToken(payload.idToken, {
        audience: appleClientId,
      })) as Awaited<ReturnType<typeof appleSignin.verifyIdToken>> & {
        given_name?: string;
        family_name?: string;
      };
      const email = applePayload.email;
      if (!email) {
        throw new UnauthorizedException('APPLE_EMAIL_REQUIRED');
      }
      const profile = {
        email,
        firstName: applePayload?.given_name ?? email.split('@')[0],
        lastName: applePayload?.family_name ?? undefined,
        preferredLocale: undefined,
      };
      const tokens = await this.handleOAuthLogin(profile, request);
      await this.security.recordLoginAttempt({
        email,
        userId: tokens.user.id,
        userRole: this.pickPrimaryRole(tokens.user.roles),
        success: true,
        reason: 'APPLE_OAUTH',
        provider: 'apple',
        ipAddress: this.extractIp(request),
        userAgent: request?.headers['user-agent'] as string | undefined,
      });
      return tokens;
    } catch (error) {
      await this.security.recordLoginAttempt({
        email: payload.email ?? 'unknown@apple',
        success: false,
        reason: 'APPLE_AUTH_FAILED',
        provider: 'apple',
        ipAddress: this.extractIp(request),
        userAgent: request?.headers['user-agent'] as string | undefined,
      });
      this.logger.warn(`Apple OAuth failed: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('APPLE_AUTH_FAILED');
    }
  }

  private async issueTokens(user: User, context: IssueContext = {}) {
    const { accessToken, refreshToken, refreshTokenId, refreshExpiresAt } = await this.generateTokens(user);

    await this.refreshTokensService.create({
      id: refreshTokenId,
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: context.request?.headers['user-agent'] as string | undefined,
      ipAddress: this.extractIp(context.request),
    });

    await this.refreshTokensService.enforceLimit(user.id, this.maxRefreshTokens);

    return { user, tokens: { accessToken, refreshToken } };
  }

  private async generateTokens(user: User) {
    const payload: AuthTokenPayload = {
      sub: user.id,
      roles: user.roles,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshTokenId = randomUUID();
    const refreshOptions: JwtSignOptions = {
      secret: this.configService.get<string>('app.jwtRefreshSecret'),
      expiresIn: (this.configService.get<string>('app.jwtRefreshExpiresIn') ?? '7d') as JwtSignOptions['expiresIn'],
      jwtid: refreshTokenId,
    };
    const refreshToken = await this.jwtService.signAsync(payload, refreshOptions);
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      refreshExpiresAt,
    };
  }

  private extractIp(request?: Request) {
    if (!request) {
      return undefined;
    }

    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim();
    }

    return request.ip;
  }

  private async sendClientWelcomeEmail(user: User) {
    const appUrl =
      this.configService.get('app.appUrl' as keyof AppEnvironmentConfig) ?? 'http://localhost:3000';
    try {
      await this.emailQueue.enqueue({
        to: user.email,
        template: 'client.welcome',
        payload: {
          firstName: user.firstName ?? user.email,
          dashboardUrl: `${appUrl.replace(/\/+$/, '')}/client/dashboard`,
          appUrl,
        },
      });
      void this.emailQueue.triggerImmediateProcessing();
    } catch (error) {
      this.logger.warn(
        `Unable to enqueue client welcome email for ${user.email}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  private async handleOAuthLogin(
    profile: {
      email: string;
      firstName?: string;
      lastName?: string;
      preferredLocale?: string;
    },
    request?: Request
  ) {
    let user = await this.usersService.findByEmail(profile.email);
    if (!user) {
      const firstName = profile.firstName?.trim() || profile.email.split('@')[0];
      const lastName = profile.lastName?.trim() || 'Saubio';
      user = await this.usersService.create(
        {
          email: profile.email,
          firstName,
          lastName,
          phone: undefined,
          preferredLocale: (this.normalizeLocale(profile.preferredLocale) ?? 'fr') as User['preferredLocale'],
          roles: ['client'],
          isActive: true,
        },
        undefined
      );
      await this.sendClientWelcomeEmail(user);
    }
    return this.issueTokens(user, { request });
  }

  private normalizeLocale(locale?: string | null): 'de' | 'en' | 'fr' | undefined {
    if (!locale) {
      return undefined;
    }
    const normalized = locale.split('-')[0]?.toLowerCase();
    if (normalized === 'de' || normalized === 'en' || normalized === 'fr') {
      return normalized;
    }
    return undefined;
  }

  private pickPrimaryRole(roles: readonly string[]): User['roles'][number] {
    const normalized = roles.map((role) => role.toLowerCase()) as User['roles'][number][];
    if (normalized.includes('admin')) return 'admin';
    if (normalized.includes('employee')) return 'employee';
    if (normalized.includes('provider')) return 'provider';
    if (normalized.includes('company')) return 'company';
    return normalized[0] ?? 'client';
  }
}
