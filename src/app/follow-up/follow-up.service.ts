import { BadRequestException, Injectable } from '@nestjs/common';
import type { PostalFollowUpResponse } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PostalCodeService } from '../geocoding/postal-code.service';
import { CreatePostalFollowUpDto } from './dto/create-follow-up.dto';

@Injectable()
export class FollowUpService {
  constructor(private readonly prisma: PrismaService, private readonly postalCodes: PostalCodeService) {}

  async create(dto: CreatePostalFollowUpDto): Promise<PostalFollowUpResponse> {
    const normalizedPostal = this.postalCodes.normalizePostalCode(dto.postalCode);
    if (!normalizedPostal) {
      throw new BadRequestException('INVALID_POSTAL_CODE');
    }
    const lookup = this.postalCodes.lookup(normalizedPostal);
    if (!lookup) {
      throw new BadRequestException('POSTAL_CODE_NOT_FOUND');
    }
    const sanitizedEmail = dto.email.trim().toLowerCase();
    const trimmedPostal = dto.postalCode.trim();
    const [record] = await this.prisma.$queryRaw<
      { id: string; email: string; postalCode: string; marketingConsent: boolean; createdAt: Date }[]
    >`
      INSERT INTO "PostalFollowUpRequest"
        ("email", "postalCode", "normalizedPostalCode", "normalizedCity", "marketingConsent")
      VALUES
        (${sanitizedEmail}, ${trimmedPostal}, ${normalizedPostal}, ${lookup.normalizedCity ?? null}, ${
          dto.marketingConsent ?? false
        })
      ON CONFLICT ("email", "normalizedPostalCode")
        DO UPDATE SET "marketingConsent" = EXCLUDED."marketingConsent", "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "email", "postalCode", "marketingConsent", "createdAt";
    `;
    return {
      id: record.id,
      email: record.email,
      postalCode: record.postalCode,
      marketingConsent: record.marketingConsent,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
