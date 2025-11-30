import { Body, Controller, ForbiddenException, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';

@ApiTags('profile')
@Controller(['profile', 'users/me'])
@UseGuards(AccessTokenGuard, RolesGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({ summary: 'Retrieve current user profile' })
  @ApiOkResponse({ description: 'Profile returned successfully.' })
  @Get()
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  getProfile(@CurrentUser() user: User) {
    return this.profileService.getProfile(user);
  }

  @ApiOperation({ summary: 'Update user profile details' })
  @ApiOkResponse({ description: 'Profile updated successfully.' })
  @Put()
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  updateProfile(@Body() payload: UpdateProfileDto, @CurrentUser() user: User) {
    return this.profileService.updateProfile(payload, user.id);
  }

  @ApiOperation({ summary: 'Update user password' })
  @ApiOkResponse({ description: 'Password updated successfully.' })
  @Patch('password')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  updatePassword(@Body() payload: UpdatePasswordDto, @CurrentUser() user: User) {
    return this.profileService.updatePassword(payload, user.id);
  }

  @ApiOperation({ summary: 'Fetch recent profile audit trail' })
  @ApiOkResponse({ description: 'Audit entries returned.' })
  @Get('audit')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  getAudit(@CurrentUser() user: User) {
    if (!user) {
      throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
    }
    return this.profileService.getAudit(user.id);
  }
}
