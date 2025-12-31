import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DigestFrequency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import type { User } from '@saubio/models';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: User) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        preferredLocale: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
        preference: {
          select: {
            marketingEmails: true,
            productUpdates: true,
            enableDarkMode: true,
            digestFrequency: true,
          },
        },
        profileAudits: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!dbUser) {
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        preferredLocale: user.preferredLocale,
        roles: user.roles,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profileAudits: [],
        preferences: {
          marketingEmails: false,
          productUpdates: true,
          enableDarkMode: false,
          digestFrequency: 'WEEKLY' as const,
        },
      };
    }

    const { profileAudits, preference, ...rest } = dbUser;
    return {
      ...rest,
      profileAudits,
      preferences: preference ?? {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: 'WEEKLY' as const,
      },
    };
  }

  async updateProfile(payload: UpdateProfileDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        preference: true,
        consent: true,
      },
    });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const userUpdateData: Record<string, unknown> = {};
    const preferenceUpdateData: Record<string, unknown> = {};
    const auditEntries: Array<{ userId: string; field: string; oldValue: string | null; newValue: string | null }> = [];

    if (payload.firstName !== undefined && payload.firstName !== user.firstName) {
      userUpdateData.firstName = payload.firstName;
      auditEntries.push({
        userId,
        field: 'firstName',
        oldValue: user.firstName,
        newValue: payload.firstName,
      });
    }

    if (payload.lastName !== undefined && payload.lastName !== user.lastName) {
      userUpdateData.lastName = payload.lastName;
      auditEntries.push({
        userId,
        field: 'lastName',
        oldValue: user.lastName,
        newValue: payload.lastName,
      });
    }

    if (payload.phone !== undefined) {
      const normalizedPhone = payload.phone === '' ? null : payload.phone;
      if (normalizedPhone !== user.phone) {
        userUpdateData.phone = normalizedPhone;
        auditEntries.push({
          userId,
          field: 'phone',
          oldValue: user.phone,
          newValue: normalizedPhone,
        });
      }
    }

    if (payload.preferredLocale !== undefined && payload.preferredLocale !== user.preferredLocale) {
      userUpdateData.preferredLocale = payload.preferredLocale;
      auditEntries.push({
        userId,
        field: 'preferredLocale',
        oldValue: user.preferredLocale,
        newValue: payload.preferredLocale,
      });
    }

    let marketingConsentChange: boolean | undefined;

    if (payload.preferences) {
      const existingPreference = user.preference;
      type PreferenceSnapshot = {
        marketingEmails: boolean;
        productUpdates: boolean;
        enableDarkMode: boolean;
        digestFrequency: DigestFrequency;
      };
      const preferenceDefaults: PreferenceSnapshot = {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      };

      const applyPreferenceChange = <K extends keyof PreferenceSnapshot>(
        key: K,
        newValue: PreferenceSnapshot[K]
      ): boolean => {
        const previous = (existingPreference as PreferenceSnapshot | null)?.[key] ?? preferenceDefaults[key];
        if (newValue !== previous) {
          preferenceUpdateData[key] = newValue;
          auditEntries.push({
            userId,
            field: `preferences.${key}`,
            oldValue: previous === null || previous === undefined ? null : String(previous),
            newValue: newValue === null || newValue === undefined ? null : String(newValue),
          });
          return true;
        }
        return false;
      };

      if (payload.preferences.marketingEmails !== undefined) {
        const changed = applyPreferenceChange('marketingEmails', payload.preferences.marketingEmails);
        if (changed) {
          marketingConsentChange = payload.preferences.marketingEmails;
        }
      }
      if (payload.preferences.productUpdates !== undefined) {
        applyPreferenceChange('productUpdates', payload.preferences.productUpdates);
      }
      if (payload.preferences.enableDarkMode !== undefined) {
        applyPreferenceChange('enableDarkMode', payload.preferences.enableDarkMode);
      }
      if (payload.preferences.digestFrequency !== undefined) {
        applyPreferenceChange('digestFrequency', payload.preferences.digestFrequency);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdateData).length) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdateData,
        });
      }

      if (Object.keys(preferenceUpdateData).length) {
        await tx.userPreference.upsert({
          where: { userId },
          update: preferenceUpdateData,
          create: {
            userId,
            marketingEmails:
              (preferenceUpdateData.marketingEmails as boolean | undefined) ?? false,
            productUpdates:
              (preferenceUpdateData.productUpdates as boolean | undefined) ?? true,
            enableDarkMode:
              (preferenceUpdateData.enableDarkMode as boolean | undefined) ?? false,
            digestFrequency:
              (preferenceUpdateData.digestFrequency as DigestFrequency | undefined) ?? DigestFrequency.WEEKLY,
          },
        });
      }

      if (auditEntries.length) {
        await tx.userProfileAudit.createMany({ data: auditEntries });
      }

      if (marketingConsentChange !== undefined) {
        const actorLabel = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
        await this.recordConsentMutation(tx, {
          userId,
          consentMarketing: marketingConsentChange,
          actorId: userId,
          actorLabel,
        });
      }

      const result = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          preferredLocale: true,
          roles: true,
          createdAt: true,
          updatedAt: true,
          preference: {
            select: {
              marketingEmails: true,
              productUpdates: true,
              enableDarkMode: true,
              digestFrequency: true,
            },
          },
          profileAudits: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!result) {
        throw new NotFoundException('USER_NOT_FOUND');
      }

      const { profileAudits, preference, ...rest } = result;
      return {
        ...rest,
        profileAudits,
        preferences: preference ?? undefined,
      };
    });
  }

  async updatePassword(payload: UpdatePasswordDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (user.hashedPassword && user.hashedPassword !== payload.currentPassword) {
      throw new NotFoundException('INVALID_CURRENT_PASSWORD');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedPassword: payload.newPassword },
    });

    await this.prisma.userProfileAudit.create({
      data: {
        userId,
        field: 'password',
        oldValue: '***',
        newValue: '***',
      },
    });

    return { success: true };
  }

  private async recordConsentMutation(
    tx: Prisma.TransactionClient,
    params: { userId: string; consentMarketing: boolean; actorId: string; actorLabel: string }
  ) {
    const now = new Date();
    const existing = await tx.userConsent.findUnique({ where: { userId: params.userId } });
    const snapshot = await tx.userConsent.upsert({
      where: { userId: params.userId },
      update: {
        consentMarketing: params.consentMarketing,
        capturedAt: now,
        updatedAt: now,
        source: 'account',
        channel: 'dashboard',
      },
      create: {
        userId: params.userId,
        consentMarketing: params.consentMarketing,
        consentStats: existing?.consentStats ?? false,
        consentPreferences: existing?.consentPreferences ?? false,
        consentNecessary: existing?.consentNecessary ?? true,
        source: 'account',
        channel: 'dashboard',
        capturedAt: now,
        firstCapturedAt: existing?.firstCapturedAt ?? now,
      },
    });

    await tx.userConsentHistory.create({
      data: {
        consentId: snapshot.id,
        userId: params.userId,
        actorId: params.actorId,
        actorLabel: params.actorLabel,
        consentMarketing: params.consentMarketing,
        consentStats: snapshot.consentStats,
        consentPreferences: snapshot.consentPreferences,
        consentNecessary: snapshot.consentNecessary,
        source: 'account',
        channel: 'dashboard',
        capturedAt: now,
        notes: 'Mise à jour via le profil utilisateur',
      },
    });
  }

  async getAudit(userId: string) {
    return this.prisma.userProfileAudit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
