import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SupportPriority, SupportStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketFiltersDto } from './dto/support-ticket-filters.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import type { User } from '@saubio/models';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: SupportTicketFiltersDto, user: User) {
    const where: Prisma.SupportTicketWhereInput = {};

    const elevated = this.isElevated(user);

    if (!elevated) {
      where.OR = [{ requesterId: user.id }, { assigneeId: user.id }];
    }

    if (filters.status) {
      where.status = filters.status as SupportStatus;
    }

    if (filters.priority) {
      where.priority = filters.priority as SupportPriority;
    }

    if (filters.search) {
      where.OR = [
        ...(where.OR ?? []),
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findOne(id: string, user: User) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        requester: true,
        assignee: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true } },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('SUPPORT_TICKET_NOT_FOUND');
    }

    const elevated = this.isElevated(user);
    const isParticipant = ticket.requesterId === user.id || ticket.assigneeId === user.id;

    if (!elevated && !isParticipant) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    return ticket;
  }

  async create(payload: CreateSupportTicketDto, user: User) {
    return this.prisma.supportTicket.create({
      data: {
        subject: payload.subject,
        description: payload.description,
        requester: { connect: { id: user.id } },
        category: payload.category,
        priority: payload.priority,
      },
      include: {
        requester: true,
        assignee: true,
      },
    });
  }

  async addMessage(ticketId: string, payload: CreateSupportMessageDto, user: User) {
    const ticket = await this.ensureTicket(ticketId);

    const elevated = this.isElevated(user);
    const isParticipant = ticket.requesterId === user.id || ticket.assigneeId === user.id;

    if (!elevated && !isParticipant) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    return this.prisma.supportMessage.create({
      data: {
        content: payload.content,
        internal: payload.internal ?? false,
        ticket: { connect: { id: ticketId } },
        author: { connect: { id: user.id } },
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async update(ticketId: string, payload: UpdateSupportTicketDto, user: User) {
    const ticket = await this.ensureTicket(ticketId);

    const elevated = this.isElevated(user);

    if (!elevated) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: payload.status,
        priority: payload.priority,
        assignee: payload.assigneeId === undefined
          ? undefined
          : payload.assigneeId
          ? { connect: { id: payload.assigneeId } }
          : { disconnect: true },
        dueAt: payload.dueAt ? new Date(payload.dueAt) : payload.dueAt === null ? null : undefined,
      },
      include: {
        requester: true,
        assignee: true,
      },
    });
  }

  private async ensureTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('SUPPORT_TICKET_NOT_FOUND');
    }
    return ticket;
  }

  private isElevated(user: User) {
    return user.roles.includes('admin') || user.roles.includes('employee');
  }
}
