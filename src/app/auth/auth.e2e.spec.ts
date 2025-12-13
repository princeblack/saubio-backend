import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { ConfigService } from '@nestjs/config';
import { User } from '@saubio/models';

jest.setTimeout(40000);

class InMemoryUsersService {
  private users: Array<{
    id: string;
    email: string;
    hashedPassword?: string;
    firstName: string;
    lastName: string;
    preferredLocale: string;
    roles: string[];
  }> = [];

  async findByEmail(email: string): Promise<User | null> {
    const record = this.users.find((u) => u.email === email.toLowerCase());
    return record ? this.toDomain(record) : null;
  }

  async create(payload: any, hashedPassword?: string): Promise<User> {
    const record = {
      id: `user_${this.users.length + 1}`,
      email: payload.email.toLowerCase(),
      hashedPassword,
      firstName: payload.firstName,
      lastName: payload.lastName,
      preferredLocale: payload.preferredLocale ?? 'de',
      roles: payload.roles.map((role: string) => role.toLowerCase()),
    };
    this.users.push(record);
    return this.toDomain(record);
  }

  async findByEmailWithSensitiveData(email: string) {
    const record = this.users.find((u) => u.email === email.toLowerCase());
    return (
      record && {
        id: record.id,
        email: record.email,
        hashedPassword: record.hashedPassword,
        roles: record.roles.map((role) => role.toUpperCase()),
      }
    );
  }

  async findOne(id: string): Promise<User> {
    const record = this.users.find((u) => u.id === id);
    if (!record) {
      throw new Error('USER_NOT_FOUND');
    }
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    email: string;
    hashedPassword?: string;
    firstName: string;
    lastName: string;
    preferredLocale: string;
    roles: string[];
  }): User {
    return {
      id: record.id,
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      preferredLocale: record.preferredLocale,
      roles: record.roles as User['roles'],
      phone: undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      companies: [],
    };
  }
}

class InMemoryRefreshTokensService {
  private store = new Map<
    string,
    {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      createdAt: Date;
      revokedAt?: Date | null;
    }
  >();

  async create({ id, userId, token, expiresAt }: any) {
    const tokenHash = await bcrypt.hash(token, 12);
    this.store.set(id, {
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    });
  }

  async validate(tokenId: string, userId: string, token: string) {
    const record = this.store.get(tokenId);
    if (!record) return null;
    if (record.userId !== userId) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt <= new Date()) return null;

    const matches = await bcrypt.compare(token, record.tokenHash);
    return matches ? { id: tokenId, ...record } : null;
  }

  async revoke(tokenId: string) {
    const record = this.store.get(tokenId);
    if (record && !record.revokedAt) {
      record.revokedAt = new Date();
      this.store.set(tokenId, record);
    }
  }

  async revokeAllForUser(userId: string) {
    for (const [id, record] of this.store.entries()) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = new Date();
        this.store.set(id, record);
      }
    }
  }

  async enforceLimit(userId: string, limit: number) {
    const tokens = Array.from(this.store.entries())
      .filter(([, record]) => record.userId === userId)
      .sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime());

    if (tokens.length <= limit) {
      return;
    }

    const toRevoke = tokens.slice(limit).map(([id]) => id);
    for (const id of toRevoke) {
      const record = this.store.get(id);
      if (record && !record.revokedAt) {
        record.revokedAt = new Date();
        this.store.set(id, record);
      }
    }
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'access-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useClass: InMemoryUsersService },
        { provide: RefreshTokensService, useClass: InMemoryRefreshTokensService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'app.jwtRefreshSecret') return 'refresh-secret';
              if (key === 'app.jwtRefreshExpiresIn') return '8h';
              if (key === 'app.jwtAccessExpiresIn') return '1h';
              if (key === 'app.maxRefreshTokens') return 1;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in, refreshes and logs out', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'e2e@example.com',
        password: 'password123',
        firstName: 'E2E',
        lastName: 'Test',
        roles: ['client'],
        preferredLocale: 'de',
      })
      .expect(201);

    const registerRefreshToken = registerResponse.body.tokens.refreshToken;
    expect(registerRefreshToken).toBeDefined();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e@example.com', password: 'password123' })
      .expect(201);

    const loginRefreshToken = loginResponse.body.tokens.refreshToken;
    expect(loginRefreshToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: registerRefreshToken })
      .expect(401);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRefreshToken })
      .expect(201);

    const rotatedRefreshToken = refreshResponse.body.tokens.refreshToken;
    expect(rotatedRefreshToken).toBeDefined();
    expect(rotatedRefreshToken).not.toBe(loginRefreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(401);
  });
});
