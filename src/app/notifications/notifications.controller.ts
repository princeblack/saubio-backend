import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkManyNotificationsDto } from './dto/mark-many-notifications.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import type { Observable } from 'rxjs';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AccessTokenGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'List notifications for a user' })
  @ApiOkResponse({ description: 'Notifications fetched successfully.' })
  @Get()
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  list(@Query() query: ListNotificationsDto, @CurrentUser() user: User) {
    const elevated = this.isElevated(user);
    const targetUserId = query.targetUserId ? query.targetUserId : undefined;

    if (targetUserId && !elevated && targetUserId !== user.id) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    const userId = targetUserId ?? user.id;
    return this.notificationsService.list(userId, query);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiOkResponse({ description: 'Notification marked as read.' })
  @Patch(':id/read')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  markRead(
    @Param('id') id: string,
    @Query('targetUserId') targetUserId: string | undefined,
    @CurrentUser() user: User,
  ) {
    const elevated = this.isElevated(user);
    if (targetUserId && !elevated && targetUserId !== user.id) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    const userId = targetUserId ?? user.id;
    return this.notificationsService.markRead(id, userId, elevated);
  }

  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiOkResponse({ description: 'Notifications marked as read.' })
  @Post('read')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  markMany(@Body() payload: MarkManyNotificationsDto, @CurrentUser() user: User) {
    const elevated = this.isElevated(user);
    if (payload.targetUserId && !elevated && payload.targetUserId !== user.id) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    const userId = payload.targetUserId ?? user.id;
    return this.notificationsService.markMany(userId, payload);
  }

  @ApiOperation({ summary: 'Retrieve notification preferences for a user' })
  @ApiOkResponse({ description: 'Notification preferences returned.' })
  @Get('preferences')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  getPreferences(@Query('targetUserId') targetUserId: string | undefined, @CurrentUser() user: User) {
    const elevated = this.isElevated(user);
    if (targetUserId && !elevated && targetUserId !== user.id) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    const userId = targetUserId ?? user.id;
    return this.notificationsService.getPreferences(userId);
  }

  @ApiOperation({ summary: 'Update notification preferences for a user' })
  @ApiOkResponse({ description: 'Notification preferences updated.' })
  @Put('preferences')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  updatePreferences(
    @Body() payload: UpdateNotificationPreferencesDto,
    @Query('targetUserId') targetUserId: string | undefined,
    @CurrentUser() user: User,
  ) {
    const elevated = this.isElevated(user);
    if (targetUserId && !elevated && targetUserId !== user.id) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }

    const userId = targetUserId ?? user.id;
    return this.notificationsService.updatePreferences(userId, payload);
  }

  @ApiOperation({ summary: 'Stream realtime notifications for the current user' })
  @Sse('stream')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  stream(@CurrentUser() user: User): Observable<MessageEvent> {
    return this.notificationsService.stream(user.id);
  }

  private isElevated(user: User) {
    return user.roles.includes('admin') || user.roles.includes('employee');
  }
}
