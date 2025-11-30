import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const DOCUMENT_TYPES = ['passport', 'id_card', 'residence_permit'] as const;
const SIDES = ['front', 'back', 'selfie'] as const;

export class UploadIdentityDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType!: (typeof DOCUMENT_TYPES)[number];

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
