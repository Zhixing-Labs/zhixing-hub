import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const RECORD_STATUSES = ['ACTIVE', 'DISABLED'] as const;
const ACCOUNT_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
] as const;
const CREATABLE_STAFF_ROLES = [
  'UNIVERSITY_DASHBOARD',
  'COLLEGE_ADMIN',
  'PROGRAM_LEAD',
  'COUNSELOR',
] as const;
const MEMBER_ROLES = ['UNIVERSITY_ADMIN', ...CREATABLE_STAFF_ROLES] as const;

export class CreateCampusDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: '地级市行政区划代码',
    example: '640100',
    type: String,
  })
  @Matches(/^\d{6}$/)
  divisionCode!: string;
}

export class CampusDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  divisionCode!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class CreateCollegeDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: '至少一个本校校区，顺序即学院校区排序',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  campusIds!: string[];
}

export class ReplaceCollegeCampusesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  campusIds!: string[];
}

export class CollegeSummaryDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class CreateMajorDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  collegeId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

export class MajorSummaryDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  collegeId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class CreateClassDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  majorId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '2026', type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  gradeLabel!: string;

  @ApiProperty({ format: 'uuid', required: false, type: String })
  @IsOptional()
  @IsUUID('4')
  counselorMembershipId?: string;
}

export class AssignClassCounselorDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  counselorMembershipId!: string | null;
}

export class ClassSummaryDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  majorId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  gradeLabel!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  counselorMembershipId!: string | null;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class CreateUniversityMemberDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ enum: CREATABLE_STAFF_ROLES })
  @IsIn(CREATABLE_STAFF_ROLES)
  role!: (typeof CREATABLE_STAFF_ROLES)[number];

  @ApiProperty({
    description: '院管 / 专业负责人 / 辅导员必填',
    format: 'uuid',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;
}

export class UniversityMemberDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: MEMBER_ROLES })
  role!: (typeof MEMBER_ROLES)[number];

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  collegeId!: string | null;

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  accountStatus!: (typeof ACCOUNT_STATUSES)[number];

  @ApiProperty({ enum: RECORD_STATUSES })
  membershipStatus!: (typeof RECORD_STATUSES)[number];
}

export class CreatedUniversityAdminDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;
}

export class AdministrativeDivisionDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: ['PROVINCE', 'PREFECTURE'] })
  level!: 'PROVINCE' | 'PREFECTURE';

  @ApiProperty({ nullable: true, type: String })
  parentCode!: string | null;
}

export class CollegeCampusLinkDto {
  @ApiProperty({ format: 'uuid', type: String })
  campusId!: string;

  @ApiProperty({ type: Number })
  sortOrder!: number;
}

export class OrgTreeClassDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  gradeLabel!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  counselorMembershipId!: string | null;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}

export class OrgTreeMajorDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];

  @ApiProperty({ type: () => OrgTreeClassDto, isArray: true })
  @Type(() => OrgTreeClassDto)
  classes!: OrgTreeClassDto[];
}

export class OrgTreeCollegeDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];

  @ApiProperty({ type: () => CollegeCampusLinkDto, isArray: true })
  @Type(() => CollegeCampusLinkDto)
  campuses!: CollegeCampusLinkDto[];

  @ApiProperty({ type: () => OrgTreeMajorDto, isArray: true })
  @Type(() => OrgTreeMajorDto)
  majors!: OrgTreeMajorDto[];
}

export class UniversityOrgTreeDto {
  @ApiProperty({ type: () => CampusDto, isArray: true })
  @Type(() => CampusDto)
  campuses!: CampusDto[];

  @ApiProperty({ type: () => OrgTreeCollegeDto, isArray: true })
  @Type(() => OrgTreeCollegeDto)
  colleges!: OrgTreeCollegeDto[];

  @ApiProperty({ type: () => UniversityMemberDto, isArray: true })
  @Type(() => UniversityMemberDto)
  members!: UniversityMemberDto[];
}
