import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Dispute as PrismaDispute,
  DisputeMessage as PrismaDisputeMessage,
  DisputeParticipantRole as PrismaDisputeParticipantRole,
  DisputeStatus as PrismaDisputeStatus,
  NotificationType,
} from '@prisma/client';
import type { DisputeRecord, DisputeStatus, DisputeParticipantRole, User } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { AddDisputeMessageDto } from './dto/add-dispute-message.dto';
import { AssignDisputeDto } from './dto/assign-dispute.dto';
import { UpdateDisputeStatusDto } from './dto/update-dispute-status.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async createDispute(user: User, payload: CreateDisputeDto): Promise<DisputeRecord> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!booking || booking.clientId !== user.id) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    const existing = await this.prisma.dispute.findFirst({
      where: {
        bookingId: booking.id,
        status: { in: [PrismaDisputeStatus.OPEN, PrismaDisputeStatus.UNDER_REVIEW, PrismaDisputeStatus.ACTION_REQUIRED] },
      },
    });
    if (existing) {
      throw new ConflictException('DISPUTE_ALREADY_OPEN');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        booking: { connect: { id: booking.id } },
        payment: booking.payments[0] ? { connect: { id: booking.payments[0].id } } : undefined,
        status: PrismaDisputeStatus.OPEN,
        reason: payload.reason,
        description: payload.description ?? null,
        openedBy: { connect: { id: user.id } },
        messages: payload.initialMessage
          ? {
              create: [
                {
                  role: PrismaDisputeParticipantRole.CLIENT,
                  message: payload.initialMessage,
                  author: { connect: { id: user.id } },
                },
              ],
            }
          : undefined,
      },
      include: this.baseInclude,
    });

    await this.notifyAdmins(dispute.id, 'Nouveau litige client');

    return this.mapDispute(dispute);
  }

  async listForUser(user: User): Promise<DisputeRecord[]> {
    const disputes = await this.prisma.dispute.findMany({
      where: { booking: { clientId: user.id } },
      orderBy: { createdAt: 'desc' },
      include: this.baseInclude,
    });
    return disputes.map((record) => this.mapDispute(record));
  }

  async getForUser(disputeId: string, user: User): Promise<DisputeRecord> {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id: disputeId, booking: { clientId: user.id } },
      include: this.baseInclude,
    });
    if (!dispute) {
      throw new NotFoundException('DISPUTE_NOT_FOUND');
    }
    return this.mapDispute(dispute);
  }

  async addMessageAsClient(disputeId: string, user: User, payload: AddDisputeMessageDto): Promise<DisputeRecord> {
    await this.ensureClientAccess(disputeId, user.id);
    await this.prisma.disputeMessage.create({
      data: {
        dispute: { connect: { id: disputeId } },
        author: { connect: { id: user.id } },
        role: PrismaDisputeParticipantRole.CLIENT,
        message: payload.message,
      },
    });
    await this.notifyAdmins(disputeId, 'Nouveau message dans un litige');

    return this.getForUser(disputeId, user);
  }

  async listForAdmin(status?: DisputeStatus): Promise<DisputeRecord[]> {
    const disputes = await this.prisma.dispute.findMany({
      where: status ? { status: this.mapStatus(status) } : undefined,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: this.baseInclude,
      take: 200,
    });
    return disputes.map((record) => this.mapDispute(record));
  }

  async getById(disputeId: string): Promise<DisputeRecord> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: this.baseInclude,
    });
    if (!dispute) {
      throw new NotFoundException('DISPUTE_NOT_FOUND');
    }
    return this.mapDispute(dispute);
  }

  async assignDispute(disputeId: string, payload: AssignDisputeDto, reviewer: User): Promise<DisputeRecord> {
    const assigneeId = payload.assigneeId ?? reviewer.id;
    const dispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { assignedTo: { connect: { id: assigneeId } } },
      include: this.baseInclude,
    });
    return this.mapDispute(dispute);
  }

  async updateStatus(disputeId: string, payload: UpdateDisputeStatusDto, reviewer: User): Promise<DisputeRecord> {
    const nextStatus = this.mapStatus(payload.status);
    const now = new Date();
    const shouldResolve =
      nextStatus === PrismaDisputeStatus.REFUNDED ||
      nextStatus === PrismaDisputeStatus.RESOLVED ||
      nextStatus === PrismaDisputeStatus.REJECTED;

    const dispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: nextStatus,
        resolution: payload.resolution ?? null,
        adminNotes: payload.adminNotes ?? null,
        refundAmountCents: payload.refundAmountCents ?? null,
        refundCurrency: payload.refundAmountCents
          ? (payload.refundCurrency ?? 'EUR').toUpperCase()
          : null,
        refundProcessedAt:
          payload.refundAmountCents && nextStatus === PrismaDisputeStatus.REFUNDED ? now : undefined,
        resolvedAt: shouldResolve ? now : null,
        assignedTo: { connect: { id: reviewer.id } },
      },
      include: this.baseInclude,
    });

    return this.mapDispute(dispute);
  }

  async addAdminMessage(disputeId: string, reviewer: User, payload: AddDisputeMessageDto): Promise<DisputeRecord> {
    await this.prisma.disputeMessage.create({
      data: {
        dispute: { connect: { id: disputeId } },
        author: { connect: { id: reviewer.id } },
        role: PrismaDisputeParticipantRole.ADMIN,
        message: payload.message,
      },
    });
    return this.getById(disputeId);
  }

  private async ensureClientAccess(disputeId: string, userId: string) {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id: disputeId, booking: { clientId: userId } },
      select: { id: true },
    });
    if (!dispute) {
      throw new ForbiddenException('DISPUTE_NOT_FOUND');
    }
  }

  private mapDispute(record: PrismaDispute & { messages: PrismaDisputeMessage[] }): DisputeRecord {
    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      bookingId: record.bookingId,
      paymentId: record.paymentId ?? undefined,
      status: this.toDomainStatus(record.status),
      reason: record.reason,
      description: record.description ?? undefined,
      openedById: record.openedById ?? undefined,
      assignedToId: record.assignedToId ?? undefined,
      resolution: record.resolution ?? undefined,
      refundAmountCents: record.refundAmountCents ?? undefined,
      refundCurrency: record.refundCurrency ?? undefined,
      refundProcessedAt: record.refundProcessedAt ? record.refundProcessedAt.toISOString() : undefined,
      resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : undefined,
      adminNotes: record.adminNotes ?? undefined,
      messages: record.messages.map((message) => ({
        id: message.id,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.createdAt.toISOString(),
        disputeId: message.disputeId,
        authorId: message.authorId ?? undefined,
        role: message.role.toLowerCase() as DisputeParticipantRole,
        message: message.message,
        attachments:
          message.attachments && typeof message.attachments === 'object'
            ? (message.attachments as Record<string, unknown>)
            : undefined,
      })),
    };
  }

  private toDomainStatus(status: PrismaDisputeStatus): DisputeStatus {
    return status.toLowerCase() as DisputeStatus;
  }

  private mapStatus(status: DisputeStatus): PrismaDisputeStatus {
    switch (status) {
      case 'open':
        return PrismaDisputeStatus.OPEN;
      case 'under_review':
        return PrismaDisputeStatus.UNDER_REVIEW;
      case 'action_required':
        return PrismaDisputeStatus.ACTION_REQUIRED;
      case 'refunded':
        return PrismaDisputeStatus.REFUNDED;
      case 'resolved':
        return PrismaDisputeStatus.RESOLVED;
      case 'rejected':
        return PrismaDisputeStatus.REJECTED;
      default:
        throw new BadRequestException('INVALID_STATUS');
    }
  }

  private async notifyAdmins(disputeId: string, message: string) {
    const admins = await this.prisma.user.findMany({
      where: { roles: { has: 'ADMIN' } },
      select: { id: true },
      take: 10,
    });
    if (!admins.length) {
      return;
    }
    await this.notifications.emit({
      userIds: admins.map((admin) => admin.id),
      type: NotificationType.SUPPORT_UPDATE,
      payload: {
        event: 'dispute_notification',
        disputeId,
        message,
      },
    });
  }

  private readonly baseInclude = {
    messages: {
      orderBy: { createdAt: 'asc' },
    },
  } as const;
}
