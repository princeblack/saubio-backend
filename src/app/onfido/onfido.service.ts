import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { AppEnvironmentConfig } from '../config/configuration';
import type { Prisma, ProviderProfile as PrismaProviderProfile, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

type OnfidoRegion = 'eu' | 'us';

const REGION_BASE: Record<OnfidoRegion, string> = {
  eu: 'https://api.eu.onfido.com/v3',
  us: 'https://api.us.onfido.com/v3',
};

@Injectable()
export class OnfidoService {
  private readonly logger = new Logger(OnfidoService.name);
  private readonly apiToken?: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService<AppEnvironmentConfig>,
    private readonly prisma: PrismaService
  ) {
    this.apiToken = this.configService.get('app.onfidoApiToken' as keyof AppEnvironmentConfig);
    const region = this.configService.get('app.onfidoRegion' as keyof AppEnvironmentConfig) ?? 'eu';
    this.baseUrl = REGION_BASE[(region as OnfidoRegion) ?? 'eu'];
  }

  isEnabled(): boolean {
    return Boolean(this.apiToken);
  }

  async ensureApplicant(profile: PrismaProviderProfile, user: PrismaUser) {
    if (profile.onfidoApplicantId) {
      return profile.onfidoApplicantId;
    }
    this.assertConfigured();
    const payload = {
      first_name: user.firstName || 'Saubio',
      last_name: user.lastName || 'Provider',
      email: user.email,
    };

    const response = await this.request('/applicants', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const applicant = (await response.json()) as { id: string };
    await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data: { onfidoApplicantId: applicant.id },
    });
    return applicant.id;
  }

  async createWorkflowRun(applicantId: string) {
    this.assertConfigured();
    const workflowId = this.configService.get('app.onfidoWorkflowId' as keyof AppEnvironmentConfig);
    if (!workflowId) {
      throw new UnauthorizedException('ONFIDO_WORKFLOW_ID_NOT_CONFIGURED');
    }

    const response = await this.request('/workflow_runs', {
      method: 'POST',
      body: JSON.stringify({
        workflow_id: workflowId,
        applicant_id: applicantId,
      }),
    });
    const data = (await response.json()) as { id: string };
    return data.id;
  }

  async generateSdkToken(applicantId: string, workflowRunId: string) {
    this.assertConfigured();
    const payload = {
      applicant_id: applicantId,
      application_id: randomUUID(),
      workflow_run_id: workflowRunId,
    };
    const response = await this.request('/sdk_token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { token: string };
    return data.token;
  }

  async handleWebhook(body: Buffer, signature?: string) {
    this.assertConfigured();
    const webhookToken = this.configService.get('app.onfidoWebhookToken' as keyof AppEnvironmentConfig);
    if (webhookToken && signature) {
      const expected = crypto.createHmac('sha256', webhookToken).update(body).digest('hex');
      const normalizedSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;
      if (expected !== normalizedSignature) {
        throw new UnauthorizedException('ONFIDO_INVALID_SIGNATURE');
      }
    }

    const payload = JSON.parse(body.toString('utf-8')) as {
      payload?: {
        action?: string;
        resource_type?: string;
        object?: { id?: string; workflow_id?: string; status?: string; output?: { status?: string } };
      };
    };

    const action = payload.payload?.action;
    if (action === 'workflow_run.completed' || action === 'workflow_run.error') {
      const workflowRunId = payload.payload?.object?.id;
      if (!workflowRunId) {
        return;
      }
      const status =
        payload.payload?.object?.output?.status ?? payload.payload?.object?.status ?? 'unknown';
      await this.updateProviderFromWorkflow(workflowRunId, status, payload.payload?.object);
    }
  }

  private async updateProviderFromWorkflow(workflowRunId: string, status: string, workflowObject?: unknown) {
    const provider = await this.prisma.providerProfile.findFirst({
      where: { onfidoWorkflowRunId: workflowRunId },
    });

    if (!provider) {
      this.logger.warn(`No provider found for workflow run ${workflowRunId}`);
      return;
    }

    const normalized = status.toLowerCase();
    const now = new Date();
    const artifacts =
      this.extractWorkflowArtifacts(workflowObject) ?? (await this.fetchWorkflowArtifacts(workflowRunId));
    const baseUpdate: Prisma.ProviderProfileUpdateInput = {};

    if (artifacts?.checkId) {
      baseUpdate.onfidoCheckId = artifacts.checkId;
    }
    if (artifacts?.reportIds?.length) {
      baseUpdate.onfidoReportIds = { set: Array.from(new Set(artifacts.reportIds)) };
    }

    if (normalized === 'approved' || normalized === 'complete') {
      await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
          ...baseUpdate,
          identityVerificationStatus: 'VERIFIED',
          identityVerifiedAt: now,
          identityVerificationReviewer: 'Onfido',
          identityVerificationReviewedAt: now,
          identityVerificationNotes: null,
        },
      });
    } else if (normalized === 'declined' || normalized === 'rejected' || normalized === 'failed') {
      await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
          ...baseUpdate,
          identityVerificationStatus: 'REJECTED',
          identityVerificationReviewer: 'Onfido',
          identityVerificationReviewedAt: now,
          identityVerificationNotes: `Onfido status: ${status}`,
        },
      });
    } else {
      this.logger.log(`Workflow ${workflowRunId} status ${status}`);
    }
  }

  private async fetchWorkflowArtifacts(workflowRunId: string) {
    try {
      const response = await this.request(`/workflow_runs/${workflowRunId}`, { method: 'GET' });
      if (!response.ok) {
        this.logger.warn(`Unable to fetch workflow run ${workflowRunId}: ${response.status}`);
        return undefined;
      }
      const payload = await response.json();
      return this.extractWorkflowArtifacts(payload);
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to fetch workflow run ${workflowRunId}`, trace);
      return undefined;
    }
  }

  private extractWorkflowArtifacts(payload?: unknown): { checkId?: string; reportIds?: string[] } | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const checkIds = new Set<string>();
    const reportIds = new Set<string>();

    const visit = (value: unknown) => {
      if (!value) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry));
        return;
      }
      if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (typeof child === 'string') {
            if (key === 'check_id' || key === 'checkId') {
              checkIds.add(child);
            }
            if (key === 'report_id' || key === 'reportId') {
              reportIds.add(child);
            }
          } else if (Array.isArray(child)) {
            if ((key === 'check_ids' || key === 'checkIds') && child.every((entry) => typeof entry === 'string')) {
              child.forEach((entry) => checkIds.add(entry as string));
            }
            if ((key === 'report_ids' || key === 'reportIds') && child.every((entry) => typeof entry === 'string')) {
              child.forEach((entry) => reportIds.add(entry as string));
            }
          }
          visit(child);
        }
      }
    };

    visit(payload);

    if (!checkIds.size && !reportIds.size) {
      return undefined;
    }

    return {
      checkId: checkIds.values().next().value,
      reportIds: reportIds.size ? Array.from(reportIds) : undefined,
    };
  }

  private assertConfigured() {
    if (!this.apiToken) {
      throw new UnauthorizedException('ONFIDO_NOT_CONFIGURED');
    }
  }

  private request(path: string, init: RequestInit) {
    this.assertConfigured();
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Token token=${this.apiToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  }
}
