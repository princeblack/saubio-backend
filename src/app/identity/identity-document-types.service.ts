import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma, IdentityDocumentType as PrismaIdentityDocumentType } from '@prisma/client';
import type { IdentityDocumentTypeConfig, CreateIdentityDocumentTypePayload, UpdateIdentityDocumentTypePayload, ProviderIdentityDocumentType } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';

interface DefaultDocumentTypeDefinition {
  code: ProviderIdentityDocumentType;
  labelFr: string;
  labelEn: string;
  labelDe: string;
  description?: string;
  isRequired: boolean;
  requiredFiles: number;
  applicableCountries?: string[];
}

const DEFAULT_IDENTITY_DOCUMENT_TYPES: DefaultDocumentTypeDefinition[] = [
  {
    code: 'id_card',
    labelFr: "Carte d'identité",
    labelEn: 'National ID card',
    labelDe: 'Personalausweis',
    description: 'Recto/verso, document officiel en cours de validité.',
    isRequired: true,
    requiredFiles: 2,
  },
  {
    code: 'passport',
    labelFr: 'Passeport',
    labelEn: 'Passport',
    labelDe: 'Reisepass',
    description: 'Pages principales du passeport (photo + signature).',
    isRequired: true,
    requiredFiles: 1,
  },
  {
    code: 'residence_permit',
    labelFr: 'Titre de séjour',
    labelEn: 'Residence permit',
    labelDe: 'Aufenthaltstitel',
    description: 'Autorisation de travail ou de résidence dans le pays d’activité.',
    isRequired: true,
    requiredFiles: 2,
  },
];

@Injectable()
export class IdentityDocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: { includeArchived?: boolean } = {}): Promise<IdentityDocumentTypeConfig[]> {
    const customs = await this.prisma.identityDocumentType.findMany({
      where: options.includeArchived ? undefined : { archivedAt: null },
      orderBy: [{ createdAt: 'asc' }],
    });

    return [...this.mapDefaults(), ...customs.map((entry) => this.mapEntity(entry))].sort((a, b) =>
      a.label.fr.localeCompare(b.label.fr)
    );
  }

  async listActive(): Promise<IdentityDocumentTypeConfig[]> {
    const customs = await this.prisma.identityDocumentType.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ createdAt: 'asc' }],
    });
    return [...this.mapDefaults(), ...customs.map((entry) => this.mapEntity(entry))].sort((a, b) =>
      a.label.fr.localeCompare(b.label.fr)
    );
  }

  async ensureAllowed(code: ProviderIdentityDocumentType): Promise<IdentityDocumentTypeConfig> {
    const normalized = this.normalizeCode(code);
    const builtin = this.mapDefaults().find((entry) => entry.code === normalized);
    if (builtin) {
      return builtin;
    }
    const entity = await this.prisma.identityDocumentType.findFirst({
      where: {
        code: normalized,
        isActive: true,
        archivedAt: null,
      },
    });
    if (!entity) {
      throw new BadRequestException('IDENTITY_DOCUMENT_TYPE_UNSUPPORTED');
    }
    return this.mapEntity(entity);
  }

  async create(payload: CreateIdentityDocumentTypePayload): Promise<IdentityDocumentTypeConfig> {
    const normalized = this.normalizeCode(payload.code);
    if (this.mapDefaults().some((entry) => entry.code === normalized)) {
      throw new BadRequestException('IDENTITY_DOCUMENT_TYPE_IMMUTABLE');
    }

    const entity = await this.prisma.identityDocumentType.create({
      data: this.buildCreateData(normalized, payload),
    });
    return this.mapEntity(entity);
  }

  async update(id: string, payload: UpdateIdentityDocumentTypePayload): Promise<IdentityDocumentTypeConfig> {
    const existing = await this.prisma.identityDocumentType.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('IDENTITY_DOCUMENT_TYPE_NOT_FOUND');
    }
    const entity = await this.prisma.identityDocumentType.update({
      where: { id },
      data: this.buildUpdateData(payload),
    });
    return this.mapEntity(entity);
  }

  async softDelete(id: string) {
    const existing = await this.prisma.identityDocumentType.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('IDENTITY_DOCUMENT_TYPE_NOT_FOUND');
    }
    await this.prisma.identityDocumentType.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
    return { success: true };
  }

  private mapDefaults(): IdentityDocumentTypeConfig[] {
    return DEFAULT_IDENTITY_DOCUMENT_TYPES.map((definition) => ({
      id: `default-${definition.code}`,
      code: definition.code,
      label: {
        fr: definition.labelFr,
        en: definition.labelEn,
        de: definition.labelDe,
      },
      description: definition.description,
      isDefault: true,
      isRequired: definition.isRequired,
      requiredFiles: definition.requiredFiles,
      applicableCountries: definition.applicableCountries ?? [],
      isActive: true,
      archivedAt: undefined,
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
      metadata: undefined,
    }));
  }

  private mapEntity(entity: PrismaIdentityDocumentType): IdentityDocumentTypeConfig {
    return {
      id: entity.id,
      code: entity.code as ProviderIdentityDocumentType,
      label: {
        fr: entity.labelFr,
        en: entity.labelEn ?? undefined,
        de: entity.labelDe ?? undefined,
      },
      description: entity.description ?? undefined,
      isDefault: false,
      isRequired: entity.isRequired,
      requiredFiles: entity.requiredFiles,
      applicableCountries: entity.applicableCountries ?? [],
      isActive: entity.isActive,
      archivedAt: entity.archivedAt ? entity.archivedAt.toISOString() : undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      metadata: entity.metadata ? (entity.metadata as Record<string, unknown>) : undefined,
    };
  }

  private buildCreateData(code: ProviderIdentityDocumentType, payload: CreateIdentityDocumentTypePayload): Prisma.IdentityDocumentTypeUncheckedCreateInput {
    return {
      code,
      labelFr: payload.labelFr,
      labelEn: payload.labelEn ?? undefined,
      labelDe: payload.labelDe ?? undefined,
      description: payload.description ?? undefined,
      isRequired: payload.isRequired ?? true,
      requiredFiles: this.normalizeRequiredFiles(payload.requiredFiles) ?? 1,
      applicableCountries: payload.applicableCountries ?? [],
      metadata: payload.metadata as Prisma.JsonValue,
    };
  }

  private buildUpdateData(payload: UpdateIdentityDocumentTypePayload): Prisma.IdentityDocumentTypeUncheckedUpdateInput {
    return {
      labelFr: payload.labelFr ?? undefined,
      labelEn: payload.labelEn ?? undefined,
      labelDe: payload.labelDe ?? undefined,
      description: payload.description ?? undefined,
      isRequired: payload.isRequired ?? undefined,
      requiredFiles: this.normalizeRequiredFiles(payload.requiredFiles),
      applicableCountries: payload.applicableCountries ? { set: payload.applicableCountries } : undefined,
      metadata: payload.metadata as Prisma.JsonValue,
      isActive: payload.isActive ?? undefined,
    };
  }

  private normalizeRequiredFiles(value?: number | null) {
    if (!value || value < 1) {
      return undefined;
    }
    return value > 1 ? 2 : 1;
  }

  private normalizeCode(code: ProviderIdentityDocumentType): ProviderIdentityDocumentType {
    return (code?.toString().trim().toLowerCase() ?? 'id_card') as ProviderIdentityDocumentType;
  }
}
