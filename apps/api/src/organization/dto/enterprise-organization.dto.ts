import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const RECORD_STATUSES = ['ACTIVE', 'DISABLED'] as const;
const ACCOUNT_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
] as const;
const STAFF_ROLES = [
  'ENTERPRISE_ADMIN',
  'HR',
  'PROJECT_LEAD',
  'MENTOR',
  'ENTERPRISE_DASHBOARD',
] as const;
const CREATABLE_ROLES = [
  'HR',
  'PROJECT_LEAD',
  'MENTOR',
  'ENTERPRISE_DASHBOARD',
] as const;

export class CreateEnterpriseDepartmentDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

export class EnterpriseDepartmentDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class ReplaceEnterpriseLocationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @Matches(/^\d{6}$/, { each: true })
  locationCodes!: string[];
}

export class CreateEnterpriseMemberDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ enum: CREATABLE_ROLES })
  @IsIn(CREATABLE_ROLES)
  role!: (typeof CREATABLE_ROLES)[number];

  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  departmentId!: string;
}

export class EnterpriseMemberDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: STAFF_ROLES })
  role!: (typeof STAFF_ROLES)[number];

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  departmentId!: string | null;

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  accountStatus!: (typeof ACCOUNT_STATUSES)[number];

  @ApiProperty({ enum: RECORD_STATUSES })
  membershipStatus!: (typeof RECORD_STATUSES)[number];
}

export class EnterpriseLocationDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  divisionCode!: string;
}

export class EnterpriseOrgDto {
  @ApiProperty({ type: String })
  natureTagCode!: string;

  @ApiProperty({ type: String })
  industryCategoryCode!: string;

  @ApiProperty({ type: () => EnterpriseLocationDto, isArray: true })
  locations!: EnterpriseLocationDto[];

  @ApiProperty({ type: () => EnterpriseDepartmentDto, isArray: true })
  departments!: EnterpriseDepartmentDto[];

  @ApiProperty({ type: () => EnterpriseMemberDto, isArray: true })
  members!: EnterpriseMemberDto[];
}
