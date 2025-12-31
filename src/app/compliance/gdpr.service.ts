import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { AdminPaginatedResponse, AdminGdprRequest, UserRole } from '@saubio/models';
import {
  GdprRequestStatus,
  GdprRequestType,
  NotificationType,
  Prisma,
  User,
  GdprRequest,
  $Enums,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGdprRequestDto } from './dto/create-gdpr-request.dto';
import { ListGdprRequestsDto } from './dto/list-gdpr-requests.dto';
import { RejectGdprRequestDto } from './dto/reject-gdpr-request.dto';
import { ConfirmGdprDeletionDto } from './dto/confirm-gdpr-deletion.dto';
import { NotificationsService } from '../notifications/notifications.service';

type ActorContext = { id: string; label: string };

@Injectable()
export class GdprService {
  private readonly exportDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService
  ) {
    const root = this.configService.get<string>('app.tmpDir' as never) ?? join(process.cwd(), 'tmp');
    this.exportDir = join(root, 'gdpr-exports');
  }

  async listRequests(query: ListGdprRequestsDto): Promise<AdminPaginatedResponse<AdminGdprRequest>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 20, 100);
    const where: Prisma.GdprRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { userEmail: { contains: q, mode: 'insensitive' } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
        { userId: q },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.gdprRequest.count({ where }),
      this.prisma.gdprRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: true, startedBy: true, processedBy: true, rejectedBy: true },
      }),
    ]);

    return {
      items: rows.map((row) => this.mapRequest(row)),
      total,
      page,
      pageSize: limit,
    };
  }

  async createRequest(dto: CreateGdprRequestDto, actor: ActorContext): Promise<AdminGdprRequest> {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const request = await this.prisma.gdprRequest.create({
      data: {
        type: dto.type,
        status: GdprRequestStatus.PENDING,
        user: { connect: { id: user.id } },
        userRole: this.pickPrismaUserRole(user.roles),
        userEmail: user.email,
        reason: dto.reason ?? null,
        auditLogs: {
          create: {
            action: 'created',
            actorId: actor.id,
            actorLabel: actor.label,
            metadata: dto.reason ? { reason: dto.reason } : undefined,
          },
        },
      },
      include: { user: true, startedBy: true, processedBy: true, rejectedBy: true },
    });

    return this.mapRequest(request);
  }

  async startProcessing(id: string, actor: ActorContext): Promise<AdminGdprRequest> {
    const request = await this.prisma.gdprRequest.findUnique({ where: { id }, include: { user: true } });
    if (!request) {
      throw new NotFoundException('GDPR_REQUEST_NOT_FOUND');
    }
    if (request.status !== GdprRequestStatus.PENDING) {
      throw new BadRequestException('GDPR_REQUEST_ALREADY_STARTED');
    }

    let exportUpdate: Prisma.GdprRequestUpdateInput | undefined;
    if (request.type === GdprRequestType.EXPORT) {
      exportUpdate = await this.generateExportBundle(request);
    }

    const updated = await this.prisma.gdprRequest.update({
      where: { id },
      data: {
        status: GdprRequestStatus.PROCESSING,
        startedAt: new Date(),
        startedBy: { connect: { id: actor.id } },
        ...exportUpdate,
        auditLogs: {
          create: {
            action: 'started',
            actorId: actor.id,
            actorLabel: actor.label,
            metadata: exportUpdate?.exportPath ? { exportPath: exportUpdate.exportPath } : undefined,
          },
        },
      },
      include: { user: true, startedBy: true, processedBy: true, rejectedBy: true },
    });

    return this.mapRequest(updated);
  }

  async confirmDeletion(id: string, dto: ConfirmGdprDeletionDto, actor: ActorContext): Promise<AdminGdprRequest> {
    const request = await this.prisma.gdprRequest.findUnique({ where: { id }, include: { user: true } });
    if (!request) {
      throw new NotFoundException('GDPR_REQUEST_NOT_FOUND');
    }
    if (request.status === GdprRequestStatus.COMPLETED) {
      throw new BadRequestException('GDPR_REQUEST_ALREADY_COMPLETED');
    }
    if (request.status === GdprRequestStatus.REJECTED) {
      throw new BadRequestException('GDPR_REQUEST_REJECTED');
    }

    const updated = await this.prisma.gdprRequest.update({
      where: { id },
      data: {
        status: GdprRequestStatus.COMPLETED,
        processedAt: new Date(),
        processedBy: { connect: { id: actor.id } },
        auditLogs: {
          create: {
            action: 'completed',
            actorId: actor.id,
            actorLabel: actor.label,
            metadata: dto.notes ? { notes: dto.notes } : undefined,
          },
        },
      },
      include: { user: true, startedBy: true, processedBy: true, rejectedBy: true },
    });

    await this.notifyUser(updated, 'completed', dto.notes);

    return this.mapRequest(updated);
  }

  async rejectRequest(id: string, dto: RejectGdprRequestDto, actor: ActorContext): Promise<AdminGdprRequest> {
    const request = await this.prisma.gdprRequest.findUnique({ where: { id }, include: { user: true } });
    if (!request) {
      throw new NotFoundException('GDPR_REQUEST_NOT_FOUND');
    }
    if (request.status === GdprRequestStatus.COMPLETED) {
      throw new BadRequestException('GDPR_REQUEST_ALREADY_COMPLETED');
    }

    const updated = await this.prisma.gdprRequest.update({
      where: { id },
      data: {
        status: GdprRequestStatus.REJECTED,
        rejectedAt: new Date(),
        rejectReason: dto.reason,
        rejectedBy: { connect: { id: actor.id } },
        auditLogs: {
          create: {
            action: 'rejected',
            actorId: actor.id,
            actorLabel: actor.label,
            metadata: { reason: dto.reason },
          },
        },
      },
      include: { user: true, startedBy: true, processedBy: true, rejectedBy: true },
    });

    await this.notifyUser(updated, 'rejected', dto.reason);

    return this.mapRequest(updated);
  }

  async getExportStream(id: string) {
    const request = await this.prisma.gdprRequest.findUnique({ where: { id } });
    if (!request || request.type !== GdprRequestType.EXPORT) {
      throw new NotFoundException('GDPR_REQUEST_NOT_FOUND');
    }
    if (request.status !== GdprRequestStatus.PROCESSING && request.status !== GdprRequestStatus.COMPLETED) {
      throw new BadRequestException('GDPR_EXPORT_NOT_READY');
    }
    if (!request.exportPath || !existsSync(request.exportPath)) {
      throw new NotFoundException('GDPR_EXPORT_MISSING');
    }
    if (request.exportExpiresAt && request.exportExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('GDPR_EXPORT_EXPIRED');
    }

    return { stream: createReadStream(request.exportPath), fileName: `${id}-export.json` };
  }

  private mapRequest(request: GdprRequest & { user: User; startedBy?: User | null; processedBy?: User | null; rejectedBy?: User | null }): AdminGdprRequest {
    return {
      id: request.id,
      type: request.type.toLowerCase() as AdminGdprRequest['type'],
      status: request.status.toLowerCase() as AdminGdprRequest['status'],
      user: {
        id: request.userId,
        email: request.userEmail,
        role: this.toApiUserRole(request.userRole),
      },
      reason: request.reason ?? undefined,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      startedAt: request.startedAt ? request.startedAt.toISOString() : undefined,
      processedAt: request.processedAt ? request.processedAt.toISOString() : undefined,
      rejectedAt: request.rejectedAt ? request.rejectedAt.toISOString() : undefined,
      startedBy: request.startedBy ? this.composeName(request.startedBy) : undefined,
      processedBy: request.processedBy ? this.composeName(request.processedBy) : undefined,
      rejectedBy: request.rejectedBy ? this.composeName(request.rejectedBy) : undefined,
      rejectReason: request.rejectReason ?? undefined,
      exportReadyAt: request.exportReadyAt ? request.exportReadyAt.toISOString() : undefined,
      exportExpiresAt: request.exportExpiresAt ? request.exportExpiresAt.toISOString() : undefined,
      exportAvailable: Boolean(request.exportPath && request.exportReadyAt && (!request.exportExpiresAt || request.exportExpiresAt > new Date())),
    };
  }

  private composeName(user: User) {
    const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return full || user.email;
  }

  private pickPrismaUserRole(roles: $Enums.UserRole[]): $Enums.UserRole {
    if (roles.includes('PROVIDER')) {
      return 'PROVIDER';
    }
    if (roles.includes('EMPLOYEE')) {
      return 'EMPLOYEE';
    }
    if (roles.includes('COMPANY')) {
      return 'COMPANY';
    }
    if (roles.includes('ADMIN')) {
      return 'ADMIN';
    }
    return 'CLIENT';
  }

  private toApiUserRole(role: $Enums.UserRole): UserRole {
    return role.toLowerCase() as UserRole;
  }

  private async generateExportBundle(request: GdprRequest & { user: User }) {
    const payload = await this.buildExportPayload(request.userId);
    await fs.mkdir(this.exportDir, { recursive: true });
    const filePath = join(this.exportDir, `${request.id}-${uuid()}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      exportPath: filePath,
      exportReadyAt: now,
      exportExpiresAt: expires,
    } satisfies Prisma.GdprRequestUpdateInput;
  }

  private async buildExportPayload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        providerProfile: true,
        clientProfile: true,
        notificationPreference: true,
        bookings: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    return {
      generatedAt: new Date().toISOString(),
      user,
    };
  }

  private async notifyUser(request: GdprRequest, event: string, notes?: string) {
    if (!request.userId) {
      return;
    }
    await this.notifications.emit({
      userIds: [request.userId],
      type: NotificationType.COMPLIANCE,
      payload: {
        event,
        requestId: request.id,
        type: request.type,
        notes: notes ?? null,
      },
    });
  }
}
