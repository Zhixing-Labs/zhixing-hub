import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const LEGAL_DOCUMENT_TYPES = [
  'USER_AGREEMENT',
  'PRIVACY_POLICY',
] as const;

export class LegalDocumentDraftDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ enum: LEGAL_DOCUMENT_TYPES })
  type!: (typeof LEGAL_DOCUMENT_TYPES)[number];

  @ApiProperty({ type: String })
  version!: string;

  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'RETIRED'] })
  status!: 'DRAFT' | 'PUBLISHED' | 'RETIRED';

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String })
  contentHash!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  publishedAt!: string | null;

  @ApiProperty({ format: 'date-time', type: String })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', type: String })
  updatedAt!: string;
}

export class SaveLegalDocumentDraftDto {
  @ApiProperty({ enum: LEGAL_DOCUMENT_TYPES })
  @IsIn(LEGAL_DOCUMENT_TYPES)
  type!: (typeof LEGAL_DOCUMENT_TYPES)[number];

  @ApiProperty({ type: String })
  @Matches(/^[A-Za-z0-9._-]{1,30}$/)
  version!: string;

  @ApiProperty({ minLength: 1, type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content!: string;
}

export class PublishLegalDocumentSetDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  userAgreementDraftId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  privacyPolicyDraftId!: string;
}
