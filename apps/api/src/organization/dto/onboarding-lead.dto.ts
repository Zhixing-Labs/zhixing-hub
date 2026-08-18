import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const LEAD_KINDS = ['UNIVERSITY', 'ENTERPRISE'] as const;
const LEAD_STATUSES = ['NEW', 'IN_PROGRESS', 'OPENED', 'CLOSED'] as const;

export class SubmitOnboardingLeadDto {
  @ApiProperty({ enum: LEAD_KINDS })
  @IsIn(LEAD_KINDS)
  kind!: (typeof LEAD_KINDS)[number];

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  institutionName!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  contactName!: string;

  @ApiProperty({ description: '联系方式（电话 / 邮箱等）', type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  contactMethod!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  intent!: string;

  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class UpdateOnboardingLeadStatusDto {
  @ApiProperty({ enum: LEAD_STATUSES })
  @IsIn(LEAD_STATUSES)
  status!: (typeof LEAD_STATUSES)[number];
}

export class OnboardingLeadDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ enum: LEAD_KINDS })
  kind!: (typeof LEAD_KINDS)[number];

  @ApiProperty({ type: String })
  institutionName!: string;

  @ApiProperty({ type: String })
  contactName!: string;

  @ApiProperty({ type: String })
  contactMethod!: string;

  @ApiProperty({ type: String })
  intent!: string;

  @ApiProperty({ enum: LEAD_STATUSES })
  status!: (typeof LEAD_STATUSES)[number];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  statusChangedAt!: Date | null;
}
