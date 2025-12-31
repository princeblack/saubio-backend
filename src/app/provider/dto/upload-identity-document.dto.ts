import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const DOCUMENT_TYPES = ['passport', 'id_card', 'residence_permit'] as const;
const SIDES = ['front', 'back', 'selfie'] as const;
const DOCUMENT_TYPE_PATTERN = /^[a-z0-9_\\-]+$/i;

export class UploadIdentityDocumentDto {
  @ApiProperty({
    description: 'Type de document (id_card, passport, residence_permit, etc.).',
    enum: DOCUMENT_TYPES,
    example: 'id_card',
  })
  @IsString()
  @Matches(DOCUMENT_TYPE_PATTERN)
  documentType!: string;

  @ApiProperty({ enum: SIDES, required: false })
  @IsOptional()
  @IsIn(SIDES)
  side?: (typeof SIDES)[number];

  @ApiProperty({
    description: 'Data URL (preferred) or HTTPS link pointing to the document image/PDF.',
    example: 'data:image/jpeg;base64,...',
  })
  @IsString()
  @MaxLength(5_000_000)
  fileData!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileName?: string;
}
