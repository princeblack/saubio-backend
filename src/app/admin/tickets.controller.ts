import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AdminTicket } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportPriority, SupportStatus } from '@prisma/client';

@ApiTags('admin')
@Controller('admin/tickets')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminTicketsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List high-level incidents' })
  @ApiOkResponse({ description: 'Tickets returned successfully.' })
  async list(): Promise<AdminTicket[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        assignee: { select: { firstName: true, lastName: true } },
      },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.subject,
      impact: this.mapImpact(ticket.priority),
      status: this.mapStatus(ticket.status),
      owner: ticket.assignee
        ? `${ticket.assignee.firstName ?? ''} ${ticket.assignee.lastName ?? ''}`.trim()
        : 'Unassigned',
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      tags: [ticket.category.toLowerCase()],
    }));
  }

  private mapImpact(priority: SupportPriority): AdminTicket['impact'] {
    switch (priority) {
      case 'LOW':
        return 'low';
      case 'MEDIUM':
        return 'medium';
      case 'HIGH':
      case 'URGENT':
        return 'high';
      default:
        return 'low';
    }
  }

  private mapStatus(status: SupportStatus): AdminTicket['status'] {
    switch (status) {
      case 'OPEN':
        return 'triage';
      case 'IN_PROGRESS':
        return 'investigating';
      case 'WAITING_CUSTOMER':
        return 'mitigated';
      case 'RESOLVED':
      case 'CLOSED':
        return 'resolved';
      default:
        return 'triage';
    }
  }
}
