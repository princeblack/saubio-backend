import { Controller, Get, Patch, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminUser, UpdateAdminUserPayload, UserRole } from '@saubio/models';

@ApiTags('admin')
@Controller('admin/users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List users with filters' })
  @ApiOkResponse({ description: 'Users returned successfully.' })
  async list(
    @Query('role') role?: string,
    @Query('status') status?: 'active' | 'invited' | 'suspended',
    @Query('search') search?: string,
  ): Promise<AdminUser[]> {
    const where: any = {};
    if (role && role !== 'all') {
      where.roles = { has: role.toUpperCase() };
    }
    if (status === 'active') {
      where.isActive = true;
      where.hashedPassword = { not: null };
    } else if (status === 'invited') {
      where.hashedPassword = null;
    } else if (status === 'suspended') {
      where.isActive = false;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search.toLowerCase(), mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => ({
      id: user.id,
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      email: user.email,
      role: (user.roles[0] ?? 'CLIENT').toLowerCase() as UserRole,
      status: this.deriveStatus(user),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
    }));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user role or status' })
  async update(@Param('id') id: string, @Body() payload: UpdateAdminUserPayload): Promise<AdminUser> {
    if (!payload.role && !payload.status) {
      throw new BadRequestException('EMPTY_UPDATE');
    }

    const data: any = {};
    if (payload.role) {
      data.roles = { set: [payload.role.toUpperCase()] };
    }
    if (payload.status === 'active') {
      data.isActive = true;
    } else if (payload.status === 'suspended') {
      data.isActive = false;
    } else if (payload.status === 'invited') {
      data.isActive = true;
      data.hashedPassword = null;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return {
      id: user.id,
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      email: user.email,
      role: (user.roles[0] ?? 'CLIENT').toLowerCase() as UserRole,
      status: this.deriveStatus(user),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
    };
  }

  private deriveStatus(user: { isActive: boolean; hashedPassword: string | null }) {
    if (!user.isActive) return 'suspended';
    if (!user.hashedPassword) return 'invited';
    return 'active';
  }
}
