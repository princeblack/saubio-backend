import { IsOptional, IsString, MinLength } from 'class-validator';

export class AdminIdentityDecisionDto {
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminIdentityRejectDto extends AdminIdentityDecisionDto {
  @IsString()
  reason!: string;
}

export class AdminIdentityResetDto {
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class AdminIdentityUnderReviewDto extends AdminIdentityDecisionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
