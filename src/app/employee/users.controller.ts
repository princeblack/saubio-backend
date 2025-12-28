import { Controller, Get, Patch, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminUser,
  UpdateAdminUserPayload,
  UserRole,
  AdminUsersOverviewResponse,
  AdminPaginatedResponse,
  AdminClientListItem,
  AdminClientDetails,
  AdminProviderListItem,
  AdminProviderDetails,
  AdminEmployeeListItem,
  AdminRolesResponse,
} from '@saubio/models';
import { EmployeeUsersService } from './users.service';

@ApiTags('employee')
@Controller('employee/users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: EmployeeUsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users with filters' })
  @ApiOkResponse({ description: 'Users returned successfully.' })
  async list(
    @Query('role') role?: string,
    @Query('status') status?: 'active' | 'invited' | 'suspended',
    @Query('search') search?: string,
  ): Promise<AdminUser[]> {
    const where: Record<string, unknown> = {};
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
      status: this.usersService['deriveStatus'](user),
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

    const data: Record<string, unknown> = {};
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
      status: this.usersService['deriveStatus'](user),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
    };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Overview stats for admin users section' })
  async overview(): Promise<AdminUsersOverviewResponse> {
    return this.usersService.getOverview();
  }

  @Get('clients')
  @ApiOperation({ summary: 'List clients with pagination' })
  async listClients(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<AdminPaginatedResponse<AdminClientListItem>> {
    return this.usersService.listClients({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      search,
    });
  }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Client details' })
  async getClient(@Param('id') id: string): Promise<AdminClientDetails> {
    return this.usersService.getClientDetails(id);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List providers with filters' })
  async listProviders(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<AdminPaginatedResponse<AdminProviderListItem>> {
    return this.usersService.listProviders({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      search,
    });
  }

  @Get('providers/:id')
  @ApiOperation({ summary: 'Provider details' })
  async getProvider(@Param('id') id: string): Promise<AdminProviderDetails> {
    return this.usersService.getProviderDetails(id);
  }

  @Get('employees')
  @ApiOperation({ summary: 'List employees' })
  async listEmployees(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<AdminPaginatedResponse<AdminEmployeeListItem>> {
    return this.usersService.listEmployees({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      search,
    });
  }

  @Get('roles')
  @ApiOperation({ summary: 'Roles & permissions overview' })
  async roles(): Promise<AdminRolesResponse> {
    return this.usersService.getRolesSummary();
  }
}
