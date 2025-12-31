import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import type { User } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GdprService } from './gdpr.service';
import { CreateGdprRequestDto } from './dto/create-gdpr-request.dto';
import { ListGdprRequestsDto } from './dto/list-gdpr-requests.dto';
import { ConfirmGdprDeletionDto } from './dto/confirm-gdpr-deletion.dto';
import { RejectGdprRequestDto } from './dto/reject-gdpr-request.dto';

@ApiTags('admin-compliance')
@Controller('admin/compliance/gdpr/requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Get()
  list(@Query() query: ListGdprRequestsDto) {
    return this.gdpr.listRequests(query);
  }

  @Post()
  create(@Body() payload: CreateGdprRequestDto, @CurrentUser() user: User) {
    return this.gdpr.createRequest(payload, this.actor(user));
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gdpr.startProcessing(id, this.actor(user));
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { stream, fileName } = await this.gdpr.getExportStream(id);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    return new StreamableFile(stream);
  }

  @Post(':id/confirm-delete')
  confirmDeletion(
    @Param('id') id: string,
    @Body() payload: ConfirmGdprDeletionDto,
    @CurrentUser() user: User
  ) {
    return this.gdpr.confirmDeletion(id, payload, this.actor(user));
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() payload: RejectGdprRequestDto, @CurrentUser() user: User) {
    return this.gdpr.rejectRequest(id, payload, this.actor(user));
  }

  private actor(user: User) {
    const label = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return { id: user.id, label };
  }
}
