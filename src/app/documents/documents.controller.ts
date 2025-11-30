import { Controller, Get, Param, UseGuards, NotFoundException, ForbiddenException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { Prisma } from '@prisma/client';
import type { User } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('documents')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('client', 'company', 'provider', 'employee', 'admin')
export class DocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentUser() user: User) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        booking: { select: { clientId: true, companyId: true } },
        provider: { select: { userId: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('DOCUMENT_NOT_FOUND');
    }

    if (!this.canAccessDocument(document, user)) {
      throw new ForbiddenException('DOCUMENT_FORBIDDEN');
    }

    const filePath = this.resolveFilePath(document.metadata, document.url);
    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('DOCUMENT_FILE_NOT_FOUND');
    }

    const stream = createReadStream(filePath);
    return new StreamableFile(stream, {
      disposition: `inline; filename="${document.name ?? 'document.pdf'}"`,
      type: 'application/pdf',
    });
  }

  private canAccessDocument(
    document: {
      booking: { clientId: string | null; companyId: string | null } | null;
      provider: { userId: string } | null;
    },
    user: User
  ) {
    const roles = user.roles ?? [];
    if (roles.includes('admin') || roles.includes('employee')) {
      return true;
    }
    if (document.booking?.clientId && document.booking.clientId === user.id) {
      return true;
    }
    if (document.provider?.userId && document.provider.userId === user.id) {
      return true;
    }
    return false;
  }

  private resolveFilePath(metadata: Prisma.JsonValue | null, fallback: string) {
    if (metadata && typeof metadata === 'object') {
      const meta = metadata as Record<string, unknown>;
      if (typeof meta['filePath'] === 'string') {
        return meta['filePath'];
      }
    }
    return fallback;
  }
}
