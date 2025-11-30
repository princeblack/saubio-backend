import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

interface CreateRefreshTokenParams {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class RefreshTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async create({ id, userId, token, expiresAt, userAgent, ipAddress }: CreateRefreshTokenParams) {
    const tokenHash = await bcrypt.hash(token, 12);
    return this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash,
        expiresAt,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
      },
    });
  }

  async validate(tokenId: string, userId: string, token: string) {
    const record = await this.prisma.refreshToken.findUnique({ where: { id: tokenId } });
    if (!record) {
      return null;
    }
    if (record.userId !== userId) {
      return null;
    }
    if (record.revokedAt) {
      return null;
    }
    if (record.expiresAt <= new Date()) {
      return null;
    }

    const matches = await bcrypt.compare(token, record.tokenHash);
    return matches ? record : null;
  }

  async revoke(tokenId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async enforceLimit(userId: string, limit: number) {
    if (!Number.isFinite(limit) || limit <= 0) {
      await this.revokeAllForUser(userId);
      return;
    }

    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (tokens.length <= limit) {
      return;
    }

    const toRevoke = tokens.slice(limit).filter((token) => !token.revokedAt).map((token) => token.id);
    if (toRevoke.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: toRevoke }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}
