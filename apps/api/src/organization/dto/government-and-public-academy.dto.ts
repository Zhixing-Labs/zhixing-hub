import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const RECORD_STATUSES = ['ACTIVE', 'DISABLED'] as const;
const ACCOUNT_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
] as const;
const ROLES = ['GOVERNMENT_DASHBOARD_ADMIN', 'GOVERNMENT_DASHBOARD'] as const;

export class CreateGovernmentMemberDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;
}

export class GovernmentMemberDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: ROLES })
  role!: (typeof ROLES)[number];

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  accountStatus!: (typeof ACCOUNT_STATUSES)[number];

  @ApiProperty({ enum: RECORD_STATUSES })
  membershipStatus!: (typeof RECORD_STATUSES)[number];
}

export class SetPublicAcademyCampusStatusDto {
  @ApiProperty({ enum: RECORD_STATUSES })
  @IsIn(RECORD_STATUSES)
  status!: (typeof RECORD_STATUSES)[number];
}

export class PublicAcademyCampusDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  divisionCode!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];

  @ApiProperty({ required: false, type: Number })
  studentCount?: number;
}
