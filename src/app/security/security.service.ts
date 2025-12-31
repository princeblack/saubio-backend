import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminPaginatedResponse,
  AdminRolesResponse,
  AdminEmployeeListItem,
  AdminSecurityIncident,
  AdminSecurityIncidentTimeline,
  AdminSecurityLog,
  AdminSecurityLoginAttempt,
  AdminSecuritySession,
  UserRole as DomainUserRole,
} from '@saubio/models';
import {
  LoginAttempt,
  Prisma,
  RefreshToken,
  SecurityIncident,
  SecurityIncidentTimeline,
  SecurityLog,
  SecurityLogCategory,
  SecurityLogLevel,
  User,
  UserRole as PrismaUserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { ListLoginAttemptsDto } from './dto/list-login-attempts.dto';
import { ListSecurityLogsDto } from './dto/list-logs.dto';
import { ListSecurityIncidentsDto } from './dto/list-incidents.dto';
import { CreateSecurityIncidentDto } from './dto/create-incident.dto';
import { UpdateSecurityIncidentDto } from './dto/update-incident.dto';
import { ListEmployeeUsersDto } from './dto/list-employee-users.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';
import { SECURITY_PERMISSION_MATRIX, PERMISSION_MATRIX_LAST_REVIEWED_AT } from './security-permissions';

interface RecordLoginAttemptParams {
  email: string;
  userId?: string;
  userRole?: DomainUserRole;
  provider?: string;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface ActorContext {
  id: string;
  label: string;
}

@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  private formatUserName(user: { firstName?: string | null; lastName?: string | null; email: string }) {
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return fullName.length > 0 ? fullName : user.email;
  }

  private deriveStatus(user: { isActive: boolean; hashedPassword: string | null }): 'active' | 'invited' | 'suspended' {
    if (!user.isActive) return 'suspended';
    if (!user.hashedPassword) return 'invited';
    return 'active';
  }

  private mapEmployeeUser(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
    updatedAt: Date | null;
    isActive: boolean;
    hashedPassword: string | null;
    roles: PrismaUserRole[];
    employeeProfiles: Array<{ role: string }>;
  }): AdminEmployeeListItem {
    return {
      id: user.id,
      name: this.formatUserName(user),
      email: user.email,
      role: user.employeeProfiles[0]?.role ?? 'Employee',
      accessRole: (user.roles[0] ?? PrismaUserRole.EMPLOYEE).toLowerCase() as DomainUserRole,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
      status: this.deriveStatus(user),
    };
  }

  async getRolesOverview(): Promise<AdminRolesResponse> {
    const roleCatalog = [
      {
        role: 'client' as const,
        description: 'Réservation de services, suivi mission et gestion de compte.',
        permissions: ['bookings:create', 'bookings:view', 'profile:update'],
      },
      {
        role: 'provider' as const,
        description: 'Accès missions assignées, planning et facturation personnelle.',
        permissions: ['missions:view', 'missions:update', 'payouts:view'],
      },
      {
        role: 'employee' as const,
        description: 'Ops/support : matching, tickets, paiements selon périmètre.',
        permissions: ['support:manage', 'matching:monitor', 'finance:review', 'identity:review'],
      },
      {
        role: 'admin' as const,
        description: 'Supervision globale : configuration, conformité, accès complet.',
        permissions: ['*'],
      },
    ];

    const roleCounts = await Promise.all(
      roleCatalog.map((entry) =>
        this.prisma.user.count({
          where: { roles: { has: entry.role.toUpperCase() as PrismaUserRole } },
        })
      )
    );

    const summaries = roleCatalog.map((entry, index) => ({
      role: entry.role,
      description: entry.description,
      permissions: entry.permissions,
      userCount: roleCounts[index],
    }));

    const adminAccountsRaw = await this.prisma.user.findMany({
      where: { roles: { has: 'ADMIN' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        hashedPassword: true,
      },
    });

    const adminAccounts = adminAccountsRaw.map((user) => ({
      id: user.id,
      name: this.formatUserName(user),
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
      status: this.deriveStatus(user),
    }));

    return {
      roles: summaries,
      adminAccounts,
      permissionMatrix: SECURITY_PERMISSION_MATRIX,
      lastReviewedAt: PERMISSION_MATRIX_LAST_REVIEWED_AT,
    };
  }

  async listEmployeeUsers(query: ListEmployeeUsersDto): Promise<AdminPaginatedResponse<AdminEmployeeListItem>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const requestedLimit = query.limit ?? query.pageSize ?? 25;
    const limit = Math.min(requestedLimit > 0 ? requestedLimit : 25, 100);
    const filterRoles: PrismaUserRole[] = query.role
      ? [query.role]
      : [PrismaUserRole.EMPLOYEE, PrismaUserRole.ADMIN];

    const where: Prisma.UserWhereInput = {
      roles: { hasSome: filterRoles },
    };

    if (query.status === 'active') {
      where.isActive = true;
      where.hashedPassword = { not: null };
    } else if (query.status === 'invited') {
      where.hashedPassword = null;
    } else if (query.status === 'suspended') {
      where.isActive = false;
    }

    if (query.q) {
      const term = query.q.trim();
      if (term.length > 0) {
        where.OR = [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          updatedAt: true,
          isActive: true,
          hashedPassword: true,
          roles: true,
          employeeProfiles: { select: { role: true }, take: 1 },
        },
      }),
    ]);

    return {
      items: users.map((user) => this.mapEmployeeUser(user)),
      total,
      page,
      pageSize: limit,
    };
  }

  async updateEmployeeRole(
    id: string,
    payload: UpdateEmployeeRoleDto,
    actor: ActorContext
  ): Promise<AdminEmployeeListItem> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        hashedPassword: true,
        roles: true,
        employeeProfiles: { select: { role: true }, take: 1 },
      },
    });

    if (!existing) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const targetRole = payload.role as PrismaUserRole;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        roles: { set: [targetRole] },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        hashedPassword: true,
        roles: true,
        employeeProfiles: { select: { role: true }, take: 1 },
      },
    });

    await this.recordSecurityLog({
      category: SecurityLogCategory.PERMISSIONS,
      level: SecurityLogLevel.INFO,
      message: `Rôle mis à jour en ${targetRole.toLowerCase()}`,
      actorId: actor.id,
      actorEmail: actor.label,
      metadata: {
        targetUserId: id,
        previousRoles: existing.roles,
        nextRole: targetRole,
        reason: payload.reason ?? undefined,
      },
    });

    return this.mapEmployeeUser(updated);
  }

  async listSessions(query: ListSessionsDto): Promise<AdminPaginatedResponse<AdminSecuritySession>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);

    const where: Prisma.RefreshTokenWhereInput = {};

    if (query.role) {
      where.user = { roles: { has: query.role } };
    }
    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed) {
        where.OR = [
          { user: { email: { contains: trimmed, mode: 'insensitive' } } },
          { userId: trimmed },
          { ipAddress: { contains: trimmed, mode: 'insensitive' } },
        ];
      }
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!Number.isNaN(fromDate.valueOf())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!Number.isNaN(toDate.valueOf())) {
          where.createdAt.lte = toDate;
        }
      }
      if (Object.keys(where.createdAt ?? {}).length === 0) {
        delete where.createdAt;
      }
    }
    if (query.status) {
      const now = new Date();
      if (query.status === 'revoked') {
        where.revokedAt = { not: null };
      } else if (query.status === 'expired') {
        where.revokedAt = null;
        where.expiresAt = { lt: now };
      } else if (query.status === 'active') {
        where.revokedAt = null;
        where.expiresAt = { gt: now };
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.refreshToken.count({ where }),
      this.prisma.refreshToken.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, roles: true },
          },
        },
      }),
    ]);

    return {
      items: rows.map((row) => this.mapSession(row)),
      total,
      page,
      pageSize: limit,
    };
  }

  async revokeSession(id: string): Promise<AdminSecuritySession> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, roles: true } } },
    });
    if (!token) {
      throw new NotFoundException('SESSION_NOT_FOUND');
    }
    if (!token.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      token.revokedAt = new Date();
    }
    return this.mapSession(token);
  }

  async listLoginAttempts(
    query: ListLoginAttemptsDto
  ): Promise<AdminPaginatedResponse<AdminSecurityLoginAttempt>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where: Prisma.LoginAttemptWhereInput = {};

    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed) {
        where.OR = [
          { email: { contains: trimmed, mode: 'insensitive' } },
          { ipAddress: { contains: trimmed, mode: 'insensitive' } },
          { userAgent: { contains: trimmed, mode: 'insensitive' } },
        ];
      }
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!Number.isNaN(fromDate.valueOf())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!Number.isNaN(toDate.valueOf())) {
          where.createdAt.lte = toDate;
        }
      }
      if (Object.keys(where.createdAt ?? {}).length === 0) {
        delete where.createdAt;
      }
    }

    if (typeof query.success === 'boolean') {
      where.success = query.success;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.loginAttempt.count({ where }),
      this.prisma.loginAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((attempt) => this.mapLoginAttempt(attempt)),
      total,
      page,
      pageSize: limit,
    };
  }

  async recordLoginAttempt(params: RecordLoginAttemptParams) {
    await this.prisma.loginAttempt.create({
      data: {
        email: params.email,
        userId: params.userId ?? null,
        userRole: params.userRole ? (params.userRole.toUpperCase() as PrismaUserRole) : null,
        provider: params.provider ?? null,
        success: params.success,
        reason: params.reason ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  async listSecurityLogs(
    query: ListSecurityLogsDto
  ): Promise<AdminPaginatedResponse<AdminSecurityLog>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where: Prisma.SecurityLogWhereInput = {};

    if (query.category) {
      where.category = query.category;
    }
    if (query.level) {
      where.level = query.level;
    }
    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed) {
        where.OR = [
          { message: { contains: trimmed, mode: 'insensitive' } },
          { requestId: { contains: trimmed, mode: 'insensitive' } },
          { actorEmail: { contains: trimmed, mode: 'insensitive' } },
        ];
      }
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!Number.isNaN(fromDate.valueOf())) where.createdAt.gte = fromDate;
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!Number.isNaN(toDate.valueOf())) where.createdAt.lte = toDate;
      }
      if (Object.keys(where.createdAt ?? {}).length === 0) {
        delete where.createdAt;
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.securityLog.count({ where }),
      this.prisma.securityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((log) => this.mapSecurityLog(log)),
      total,
      page,
      pageSize: limit,
    };
  }

  async recordSecurityLog(log: {
    category: SecurityLogCategory;
    level: SecurityLogLevel;
    message: string;
    requestId?: string;
    actorId?: string;
    actorEmail?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.securityLog.create({
      data: {
        category: log.category,
        level: log.level,
        message: log.message,
        requestId: log.requestId ?? null,
        actorId: log.actorId ?? null,
        actorEmail: log.actorEmail ?? null,
        metadata: this.asJsonObject(log.metadata),
      },
    });
  }

  async listSecurityIncidents(
    query: ListSecurityIncidentsDto
  ): Promise<AdminPaginatedResponse<AdminSecurityIncident>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where: Prisma.SecurityIncidentWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.severity) where.severity = query.severity;
    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed) {
        where.OR = [
          { title: { contains: trimmed, mode: 'insensitive' } },
          { description: { contains: trimmed, mode: 'insensitive' } },
        ];
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.securityIncident.count({ where }),
      this.prisma.securityIncident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.incidentInclude(),
      }),
    ]);

    return {
      items: rows.map((incident) => this.mapIncident(incident)),
      total,
      page,
      pageSize: limit,
    };
  }

  async createIncident(dto: CreateSecurityIncidentDto, actor: ActorContext): Promise<AdminSecurityIncident> {
    const incident = await this.prisma.securityIncident.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category ?? 'OTHER',
        severity: dto.severity ?? 'MEDIUM',
        assignedTo: dto.assignedToId ? { connect: { id: dto.assignedToId } } : undefined,
        timeline: {
          create: {
            actor: { connect: { id: actor.id } },
            actorLabel: actor.label,
            action: 'created',
            message: dto.description,
          },
        },
      },
      include: this.incidentInclude(),
    });
    return this.mapIncident(incident);
  }

  async updateIncident(id: string, dto: UpdateSecurityIncidentDto, actor: ActorContext): Promise<AdminSecurityIncident> {
    const existing = await this.prisma.securityIncident.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('INCIDENT_NOT_FOUND');
    }

    const data: Prisma.SecurityIncidentUpdateInput = {};
    if (dto.title) data.title = dto.title;
    if (dto.description) data.description = dto.description;
    if (dto.category) data.category = dto.category;
    if (dto.severity) data.severity = dto.severity;
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'RESOLVED' || dto.status === 'CLOSED') {
        data.resolvedAt = new Date();
        data.resolvedBy = { connect: { id: actor.id } };
      }
    }
    if (dto.assignedToId === null) {
      data.assignedTo = { disconnect: true };
    } else if (dto.assignedToId) {
      data.assignedTo = { connect: { id: dto.assignedToId } };
    }

    const timelineEntries: Prisma.SecurityIncidentTimelineCreateWithoutIncidentInput[] = [];
    if (dto.timelineMessage) {
      timelineEntries.push({
        actor: { connect: { id: actor.id } },
        actorLabel: actor.label,
        action: 'comment',
        message: dto.timelineMessage,
      });
    }
    if (dto.status && dto.status !== existing.status) {
      timelineEntries.push({
        actor: { connect: { id: actor.id } },
        actorLabel: actor.label,
        action: `status_${dto.status.toLowerCase()}`,
        message: `Statut mis à "${dto.status.toLowerCase()}"`,
      });
    }

    const updated = await this.prisma.securityIncident.update({
      where: { id },
      data: {
        ...data,
        timeline: timelineEntries.length ? { create: timelineEntries } : undefined,
      },
      include: this.incidentInclude(),
    });

    return this.mapIncident(updated);
  }

  private mapSession(
    row: RefreshToken & { user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'roles'> }
  ): AdminSecuritySession {
    const now = new Date();
    const status: AdminSecuritySession['status'] = row.revokedAt
      ? 'revoked'
      : row.expiresAt <= now
      ? 'expired'
      : 'active';
    return {
      id: row.id,
      user: {
        id: row.user.id,
        email: row.user.email,
        firstName: row.user.firstName ?? undefined,
        lastName: row.user.lastName ?? undefined,
        role: this.primaryRole(row.user.roles),
      },
      status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString(),
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
    };
  }

  private mapLoginAttempt(attempt: LoginAttempt): AdminSecurityLoginAttempt {
    return {
      id: attempt.id,
      email: attempt.email,
      userId: attempt.userId ?? undefined,
      userRole: attempt.userRole ? (attempt.userRole.toLowerCase() as AdminSecurityLoginAttempt['userRole']) : undefined,
      provider: attempt.provider ?? undefined,
      success: attempt.success,
      reason: attempt.reason ?? undefined,
      ipAddress: attempt.ipAddress ?? undefined,
      userAgent: attempt.userAgent ?? undefined,
      createdAt: attempt.createdAt.toISOString(),
    };
  }

  private primaryRole(roles: PrismaUserRole[]): DomainUserRole {
    if (roles.includes('ADMIN')) return 'admin';
    if (roles.includes('EMPLOYEE')) return 'employee';
    if (roles.includes('PROVIDER')) return 'provider';
    if (roles.includes('COMPANY')) return 'company';
    if (roles.includes('CLIENT')) return 'client';
    return (roles[0]?.toLowerCase() as DomainUserRole) ?? 'client';
  }

  private mapSecurityLog(log: SecurityLog): AdminSecurityLog {
    return {
      id: log.id,
      category: log.category.toLowerCase() as AdminSecurityLog['category'],
      level: log.level.toLowerCase() as AdminSecurityLog['level'],
      message: log.message,
      requestId: log.requestId ?? undefined,
      actorId: log.actorId ?? undefined,
      actorEmail: log.actorEmail ?? undefined,
      metadata: (log.metadata as Record<string, unknown> | null) ?? undefined,
      createdAt: log.createdAt.toISOString(),
    };
  }

  private mapIncident(
    incident: SecurityIncident & {
      assignedTo: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
      timeline: SecurityIncidentTimeline[];
    }
  ): AdminSecurityIncident {
    return {
      id: incident.id,
      title: incident.title,
      description: incident.description,
      category: incident.category.toLowerCase() as AdminSecurityIncident['category'],
      severity: incident.severity.toLowerCase() as AdminSecurityIncident['severity'],
      status: incident.status.toLowerCase() as AdminSecurityIncident['status'],
      assignedTo: incident.assignedTo
        ? {
            id: incident.assignedTo.id,
            email: incident.assignedTo.email,
            firstName: incident.assignedTo.firstName ?? undefined,
            lastName: incident.assignedTo.lastName ?? undefined,
          }
        : undefined,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString(),
      timeline: incident.timeline
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((entry) => this.mapIncidentTimeline(entry)),
    };
  }

  private mapIncidentTimeline(entry: SecurityIncidentTimeline): AdminSecurityIncidentTimeline {
    return {
      id: entry.id,
      actorId: entry.actorId ?? undefined,
      actorLabel: entry.actorLabel ?? undefined,
      action: entry.action,
      message: entry.message ?? undefined,
      createdAt: entry.createdAt.toISOString(),
      metadata: (entry.metadata as Record<string, unknown> | null) ?? undefined,
    };
  }

  private incidentInclude() {
    return {
      assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
      timeline: true,
    } satisfies Prisma.SecurityIncidentInclude;
  }

  private asJsonObject(value?: Record<string, unknown> | null): Prisma.JsonObject | undefined {
    if (!value) {
      return undefined;
    }
    return value as Prisma.JsonObject;
  }
}
