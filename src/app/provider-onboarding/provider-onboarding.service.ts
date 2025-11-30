import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ProviderOnboardingRequest,
  ProviderOnboardingStatus,
  ProviderType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateProviderOnboardingDto } from './dto/create-provider-onboarding.dto';
import type { UpdateProviderOnboardingDto } from './dto/update-provider-onboarding.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironmentConfig } from '../config/configuration';

@Injectable()
export class ProviderOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueueService,
    private readonly configService: ConfigService<AppEnvironmentConfig>
  ) {}

  async create(payload: CreateProviderOnboardingDto) {
    const created = await this.prisma.providerOnboardingRequest.create({
      data: {
        type: payload.type,
        contactName: payload.contactName,
        companyName: payload.companyName,
        email: payload.email.toLowerCase(),
        phone: payload.phone,
        languages: payload.languages,
        serviceAreas: payload.serviceAreas,
        message: payload.message,
      },
    });

    await this.enqueueChecklistEmail(created);

    return this.mapToResponse(created);
  }

  async list(status?: ProviderOnboardingStatus) {
    const records = await this.prisma.providerOnboardingRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.mapToResponse(record));
  }

  async update(id: string, payload: UpdateProviderOnboardingDto) {
    const existing = await this.prisma.providerOnboardingRequest.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('PROVIDER_ONBOARDING_NOT_FOUND');
    }

    const updated = await this.prisma.providerOnboardingRequest.update({
      where: { id },
      data: {
        status: payload.status,
        reviewer: payload.reviewer,
        reviewedAt: new Date(),
      },
    });
    if (
      payload.status === ProviderOnboardingStatus.APPROVED &&
      existing.status !== ProviderOnboardingStatus.APPROVED
    ) {
      await this.ensureProviderAccount(updated);
    }
    return this.mapToResponse(updated);
  }

  private mapToResponse(entity: ProviderOnboardingRequest) {
    return {
      ...entity,
      type: entity.type.toLowerCase() as Lowercase<ProviderType>,
      status: entity.status.toLowerCase() as Lowercase<ProviderOnboardingStatus>,
    };
  }

  private async ensureProviderAccount(request: ProviderOnboardingRequest) {
    const email = request.email.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    const { firstName, lastName } = this.splitContactName(request.contactName);

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          preferredLocale: 'fr',
          roles: { set: [UserRole.PROVIDER] },
        },
      });
    } else if (!user.roles.includes(UserRole.PROVIDER)) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          roles: { set: [...new Set([...user.roles, UserRole.PROVIDER])] },
        },
      });
    }

    const existingProfile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.id },
    });

    if (!existingProfile) {
      await this.prisma.providerProfile.create({
        data: {
          user: { connect: { id: user.id } },
          providerType: request.type,
          languages: request.languages,
          serviceAreas: request.serviceAreas,
          serviceCategories: [],
          hourlyRateCents: 0,
          offersEco: false,
        },
      });
    } else {
      await this.prisma.providerProfile.update({
        where: { id: existingProfile.id },
        data: {
          providerType: request.type,
          languages: { set: request.languages },
          serviceAreas: { set: request.serviceAreas },
        },
      });
    }
  }

  private splitContactName(fullName: string) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) {
      return { firstName: 'Provider', lastName: 'Saubio' };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Saubio' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  private async enqueueChecklistEmail(request: ProviderOnboardingRequest) {
    try {
      const appUrl = this.configService.get('app.appUrl' as keyof AppEnvironmentConfig) ?? 'http://localhost:3000';
      await this.emailQueue.enqueue({
        to: request.email,
        template: 'provider.onboarding.checklist',
        payload: {
          contactName: request.contactName,
          companyName: request.companyName,
          checklistUrl: `${appUrl.replace(/\/$/, '')}/prestataire/checklist`,
          appUrl,
        },
      });
      void this.emailQueue.triggerImmediateProcessing();
    } catch (error) {
      console.warn('ProviderOnboardingEmail', {
        type: 'CHECKLIST_EMAIL_FAILED',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
