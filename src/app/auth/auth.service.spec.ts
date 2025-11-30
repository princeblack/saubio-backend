import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '@saubio/models';
import { RefreshTokensService } from './refresh-tokens.service';
import { EmailQueueService } from '../notifications/email-queue.service';

const mockRequest: any = {
  headers: { 'user-agent': 'jest' },
  ip: '127.0.0.1',
};

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let refreshTokensService: jest.Mocked<RefreshTokensService>;
  let emailQueue: jest.Mocked<EmailQueueService>;

  const user: User = {
    id: 'user_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    email: 'test@example.com',
    phone: undefined,
    firstName: 'Test',
    lastName: 'User',
    roles: ['client'],
    preferredLocale: 'de',
    isActive: true,
    companies: [],
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findByEmailWithSensitiveData: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'app.jwtRefreshSecret':
            return 'refresh-secret';
          case 'app.jwtRefreshExpiresIn':
            return '7d';
          default:
            return undefined;
        }
      }),
    } as unknown as jest.Mocked<ConfigService>;

    refreshTokensService = {
      create: jest.fn(),
      validate: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      enforceLimit: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokensService>;

    emailQueue = {
      enqueue: jest.fn(),
    } as unknown as jest.Mocked<EmailQueueService>;

    authService = new AuthService(usersService, jwtService, configService, refreshTokensService, emailQueue);
  });

  it('registers a new user and returns tokens', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(async () => user);
    jwtService.signAsync.mockResolvedValueOnce('access-token');
    jwtService.signAsync.mockResolvedValueOnce('refresh-token');
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });

    const result = await authService.register(
      {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        roles: ['client'],
        preferredLocale: 'de',
      },
      mockRequest
    );

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
      expect.any(String)
    );
    expect(refreshTokensService.create).toHaveBeenCalled();
    expect(refreshTokensService.enforceLimit).toHaveBeenCalled();
    expect(result.tokens.accessToken).toBe('access-token');
    expect(result.tokens.refreshToken).toBe('refresh-token');
  });

  it('throws if email already exists', async () => {
    usersService.findByEmail.mockResolvedValue(user);

    await expect(
      authService.register(
        {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          roles: ['client'],
          preferredLocale: 'de',
        },
        mockRequest
      )
    ).rejects.toThrow(UnauthorizedException);
  });

  it('logs in with valid credentials', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    usersService.findByEmailWithSensitiveData.mockResolvedValue({
      id: user.id,
      email: user.email,
      hashedPassword,
      roles: ['CLIENT'],
    } as any);
    usersService.findOne.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValueOnce('access-token');
    jwtService.signAsync.mockResolvedValueOnce('refresh-token');
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });

    const result = await authService.login({ email: user.email, password: 'password123' }, mockRequest);
    expect(refreshTokensService.create).toHaveBeenCalled();
    expect(refreshTokensService.enforceLimit).toHaveBeenCalledWith(user.id, expect.any(Number));
    expect(result.tokens.accessToken).toBe('access-token');
  });

  it('throws on invalid password', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    usersService.findByEmailWithSensitiveData.mockResolvedValue({
      id: user.id,
      email: user.email,
      hashedPassword,
      roles: ['CLIENT'],
    } as any);

    await expect(
      authService.login({ email: user.email, password: 'wrong' }, mockRequest)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refreshes tokens with valid refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id, roles: ['client'], jti: 'token-1' });
    refreshTokensService.validate.mockResolvedValue({
      id: 'token-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    usersService.findOne.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValueOnce('new-access');
    jwtService.signAsync.mockResolvedValueOnce('new-refresh');
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });

    const result = await authService.refresh({ refreshToken: 'refresh-token' }, mockRequest);
    expect(refreshTokensService.validate).toHaveBeenCalledWith('token-1', user.id, 'refresh-token');
    expect(refreshTokensService.revoke).toHaveBeenCalledWith('token-1');
    expect(refreshTokensService.enforceLimit).toHaveBeenCalledWith(user.id, expect.any(Number));
    expect(result.tokens.refreshToken).toBe('new-refresh');
  });
});
