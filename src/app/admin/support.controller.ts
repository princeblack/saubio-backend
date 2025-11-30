import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AdminSupportItem } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportPriority, SupportStatus } from '@prisma/client';

@ApiTags('admin')
@Controller('admin/support')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminSupportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List support pipeline' })
  @ApiOkResponse({ description: 'Support pipeline returned successfully.' })
  async list(): Promise<AdminSupportItem[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      include: {
        requester: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      priority: this.mapPriority(ticket.priority),
      status: this.mapStatus(ticket.status),
      updatedAt: ticket.updatedAt.toISOString(),
      assignee: ticket.assignee
        ? `${ticket.assignee.firstName ?? ''} ${ticket.assignee.lastName ?? ''}`.trim()
        : undefined,
      requester: `${ticket.requester.firstName ?? ''} ${ticket.requester.lastName ?? ''}`.trim(),
      channel: 'app',
    }));
  }

  private mapPriority(priority: SupportPriority): AdminSupportItem['priority'] {
    switch (priority) {
      case 'LOW':
        return 'low';
      case 'MEDIUM':
        return 'medium';
      case 'HIGH':
        return 'high';
      case 'URGENT':
        return 'urgent';
      default:
        return 'medium';
    }
  }

  private mapStatus(status: SupportStatus): AdminSupportItem['status'] {
    switch (status) {
      case 'OPEN':
        return 'new';
      case 'IN_PROGRESS':
        return 'assigned';
      case 'WAITING_CUSTOMER':
        return 'waiting_client';
      case 'RESOLVED':
      case 'CLOSED':
        return 'resolved';
      default:
        return 'new';
    }
  }
}
