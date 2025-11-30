import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailQueueStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppEnvironmentConfig } from '../config/configuration';
import { renderEmailTemplate } from './email-templates';

interface EnqueueEmailOptions {
  to: string;
  template: string;
  payload: Record<string, unknown>;
  scheduledAt?: Date;
}

interface EmailDispatcherAdapter {
  sendEmail:
    | ((options: { to: string; template: string; payload: Record<string, unknown> }) => Promise<void>)
    | null;
}

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly dispatcher: EmailDispatcherAdapter;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<AppEnvironmentConfig>
  ) {
    const providerUrl = configService.get('app.emailProviderUrl' as keyof AppEnvironmentConfig);
    const providerToken = configService.get('app.emailProviderToken' as keyof AppEnvironmentConfig);

    if (providerUrl) {
      this.dispatcher = {
        sendEmail: async ({ to, template, payload }) => {
          const response = await fetch(String(providerUrl), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}),
            },
            body: JSON.stringify({ to, template, payload }),
          });
          if (!response.ok) {
            const message = await response.text();
            throw new Error(`Email provider responded ${response.status}: ${message || 'Unknown error'}`);
          }
        },
      };
    } else {
      const smtpHost = configService.get('app.smtpHost' as keyof AppEnvironmentConfig);
      const smtpPort = configService.get('app.smtpPort' as keyof AppEnvironmentConfig);
      const smtpSecure = configService.get('app.smtpSecure' as keyof AppEnvironmentConfig);
      const smtpUser = configService.get('app.smtpUser' as keyof AppEnvironmentConfig);
      const smtpPass = configService.get('app.smtpPass' as keyof AppEnvironmentConfig);
      const smtpFrom = configService.get('app.smtpFrom' as keyof AppEnvironmentConfig);

      if (smtpHost && smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
          host: String(smtpHost),
          port: typeof smtpPort === 'number' ? smtpPort : 465,
          secure: typeof smtpSecure === 'boolean' ? smtpSecure : true,
          auth: {
            user: String(smtpUser),
            pass: String(smtpPass),
          },
        });

        this.dispatcher = {
          sendEmail: async ({ to, template, payload }) => {
            const rendered = renderEmailTemplate(template, payload);
            if (!rendered) {
              throw new Error(`EMAIL_TEMPLATE_NOT_IMPLEMENTED:${template}`);
            }

            await transporter.sendMail({
              from: (smtpFrom as string | undefined) ?? String(smtpUser),
              to,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html,
            });
          },
        };
      } else {
        this.dispatcher = {
          sendEmail: null,
        };
      }
    }
  }

  async enqueue(options: EnqueueEmailOptions) {
    try {
      await this.prisma.emailQueue.create({
        data: {
          to: options.to,
          template: options.template,
          payload: options.payload as Prisma.JsonValue,
          scheduledAt: options.scheduledAt,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to enqueue email ${options.template} for ${options.to}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  @Cron('*/2 * * * *')
  async processQueue() {
    await this.runQueue();
  }

  async triggerImmediateProcessing() {
    await this.runQueue();
  }

  private async runQueue() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const pending = await this.prisma.emailQueue.findMany({
        where: {
          status: EmailQueueStatus.PENDING,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      if (!pending.length) {
        return;
      }

      for (const email of pending) {
        try {
          if (!this.dispatcher.sendEmail) {
            this.logger.warn(
              `Email dispatcher not configured. Skipping delivery for template=${email.template} -> ${email.to}`
            );
            throw new Error('EMAIL_DISPATCHER_NOT_CONFIGURED');
          }

          await this.dispatcher.sendEmail({
            to: email.to,
            template: email.template,
            payload: email.payload as Record<string, unknown>,
          });

          await this.prisma.emailQueue.update({
            where: { id: email.id },
            data: { status: EmailQueueStatus.SENT, sentAt: new Date(), error: null },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to send email ${email.template} to ${email.to}: ${error instanceof Error ? error.message : error}`
          );
          await this.prisma.emailQueue.update({
            where: { id: email.id },
            data: { status: EmailQueueStatus.FAILED, error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
