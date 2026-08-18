import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const REGISTRATION_GENDERS = ['MALE', 'FEMALE', 'UNSPECIFIED'] as const;
const PROFILE_GENDERS = ['MALE', 'FEMALE', 'UNSPECIFIED'] as const;
const STUDENT_KINDS = ['UNIVERSITY_CERTIFIED', 'PLATFORM'] as const;
const LIFECYCLE_STATES = [
  'ENROLLED',
  'GRADUATE_ACTIVE',
  'READ_ONLY',
  'SUSPENDED',
] as const;

export class RequestRegistrationCodeDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class ConfirmRegistrationDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ example: '123456', type: String })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  consentDocumentVersionIds!: string[];

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({
    description: '平台学员注册可选：男 / 女 / 未说明',
    enum: REGISTRATION_GENDERS,
  })
  @IsIn(REGISTRATION_GENDERS)
  gender!: (typeof REGISTRATION_GENDERS)[number];

  @ApiProperty({
    description: '出生日期，YYYY-MM-DD',
    example: '2004-05-01',
    type: String,
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate!: string;

  @ApiProperty({
    description: '注册城市（地级市行政区划代码，决定归属的公开学院校区学院）',
    example: '640100',
    type: String,
  })
  @Matches(/^\d{6}$/)
  registrationCityCode!: string;
}

export class CompleteFirstLoginProfileDto {
  @ApiProperty({
    description: '出生年月日（必填），YYYY-MM-DD',
    type: String,
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate!: string;

  @ApiPropertyOptional({
    description: '政治面貌（选填；平台无功能消费该字段，不作筛选条件）',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  politicalAffiliation?: string;
}

export class UpdateResidentCityDto {
  @ApiProperty({ example: '640100', type: String })
  @Matches(/^\d{6}$/)
  residentCityCode!: string;
}

export class SelfCorrectProfileDto {
  @ApiPropertyOptional({ required: false, type: String })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ required: false, enum: PROFILE_GENDERS })
  @IsOptional()
  @IsIn(PROFILE_GENDERS)
  gender?: (typeof PROFILE_GENDERS)[number];

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD',
    required: false,
    type: String,
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string;

  @ApiPropertyOptional({
    description: '注册城市变更（同步常驻城市初值）',
    required: false,
    type: String,
  })
  @IsOptional()
  @Matches(/^\d{6}$/)
  registrationCityCode?: string;
}

export class StudentProfileStudentDto {
  @ApiProperty({ enum: STUDENT_KINDS })
  kind!: (typeof STUDENT_KINDS)[number];

  @ApiProperty({ enum: LIFECYCLE_STATES })
  lifecycleState!: (typeof LIFECYCLE_STATES)[number];

  @ApiProperty({ nullable: true, type: String })
  registrationCityCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  residentCityCode!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: '注册信息冻结截止（平台学员自注册起 90 天）',
  })
  profileFrozenUntil!: Date | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: '最近一次自助修改（滚动 365 天至多 1 次的基准）',
  })
  lastSelfEditedAt!: Date | null;
}

export class MyProfileDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, enum: PROFILE_GENDERS })
  gender!: (typeof PROFILE_GENDERS)[number] | null;

  @ApiProperty({ nullable: true, type: String })
  birthDate!: string | null;

  @ApiProperty({ nullable: true, type: String })
  politicalAffiliation!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: '首登资料补齐完成时间；为空表示业务门禁尚未放行',
  })
  profileCompletedAt!: Date | null;

  @ApiProperty({ nullable: true, type: () => StudentProfileStudentDto })
  student!: StudentProfileStudentDto | null;
}

export class RequestPhoneChangeOldCodeDto {
  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class RequestPhoneChangeNewCodeDto {
  @ApiProperty({ example: '123456', type: String })
  @Matches(/^\d{6}$/)
  oldPhoneCode!: string;

  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  newPhone!: string;

  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class ConfirmPhoneChangeDto {
  @ApiProperty({ example: '123456', type: String })
  @Matches(/^\d{6}$/)
  newPhoneCode!: string;
}

export class PhoneChangeConfirmResultDto {
  @ApiProperty({ type: Boolean })
  applied!: boolean;

  @ApiProperty({
    description: '高校认证学员换绑须辅导员确认后生效（《07》5.6）',
    type: Boolean,
  })
  requiresCounselorConfirmation!: boolean;
}

export class CounselorInitiatePhoneChangeDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  newPhone!: string;

  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class CounselorVerifyPhoneChangeDto {
  @ApiProperty({ example: '123456', type: String })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class CounselorResolvePhoneChangeDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  approve!: boolean;
}

export class PendingPhoneChangeDto {
  @ApiProperty({ format: 'uuid', type: String })
  requestId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  studentAccountId!: string;

  @ApiProperty({ type: String })
  studentNumber!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  currentPhone!: string | null;

  @ApiProperty({ type: String })
  newPhone!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    description: '展示用逾期天数（不自动通过、无时限，《07》5.6）',
    type: Number,
  })
  pendingDays!: number;
}
