import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User as PrismaUser, UserRole as PrismaUserRole } from '@prisma/client';
import { User, UserRole } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      include: {
        companyMemberships: true,
      },
    });

    return users.map((user) => this.toDomain(user));
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        companyMemberships: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    return this.toDomain(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        companyMemberships: true,
      },
    });

    return user ? this.toDomain(user) : null;
  }

  async findByEmailWithSensitiveData(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async create(payload: CreateUserDto, hashedPassword?: string): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        hashedPassword,
        phone: payload.phone,
      firstName: payload.firstName,
      lastName: payload.lastName,
      preferredLocale: payload.preferredLocale,
      isActive: payload.isActive ?? true,
      roles: payload.roles.map((role) => this.toPrismaRole(role)),
      },
      include: {
        companyMemberships: true,
      },
    });

    return this.toDomain(user);
  }

  async update(id: string, payload: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = {};
    const partial = payload as Partial<CreateUserDto> & Partial<UpdateUserDto>;

    if (partial.email) {
      data.email = partial.email.toLowerCase();
    }
    if (partial.phone !== undefined) {
      data.phone = partial.phone;
    }
    if (partial.firstName) {
      data.firstName = partial.firstName;
    }
    if (partial.lastName) {
      data.lastName = partial.lastName;
    }
    if (partial.preferredLocale) {
      data.preferredLocale = partial.preferredLocale;
    }
    if (partial.isActive !== undefined) {
      data.isActive = partial.isActive;
    }
    if (partial.roles) {
      data.roles = partial.roles.map((role) => this.toPrismaRole(role));
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        companyMemberships: true,
      },
    });

    return this.toDomain(user);
  }

  private toDomain(entity: PrismaUser & { companyMemberships: { companyId: string }[] }): User {
    return {
      id: entity.id,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      email: entity.email,
      phone: entity.phone ?? undefined,
      firstName: entity.firstName,
      lastName: entity.lastName,
      preferredLocale: entity.preferredLocale,
      isActive: entity.isActive,
      roles: entity.roles.map((role) => this.toDomainRole(role)),
      companies: entity.companyMemberships.map((membership) => membership.companyId),
    };
  }

  private toPrismaRole(role: UserRole): PrismaUserRole {
    return role.toUpperCase() as PrismaUserRole;
  }

  private toDomainRole(role: PrismaUserRole): UserRole {
    return role.toLowerCase() as UserRole;
  }
}
