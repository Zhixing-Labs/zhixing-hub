import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const LIFECYCLE_STATES = [
  'ENROLLED',
  'GRADUATE_ACTIVE',
  'READ_ONLY',
  'SUSPENDED',
] as const;
const ACCOUNT_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
] as const;
const GENDERS = ['MALE', 'FEMALE'] as const;

export class CreateClassStudentDto {
  @ApiProperty({ description: '姓名（学校名册为准，2–100 字符）', type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: '学号（本校终身不回收；数字、字母与连字符，1–50）',
    example: '2026010101',
    type: String,
  })
  @Matches(/^[0-9A-Za-z-]{1,50}$/)
  studentNumber!: string;

  @ApiProperty({ example: '13800138001', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({
    description: '性别（CSV 导入同口径：仅男 / 女）',
    enum: GENDERS,
  })
  @IsIn(GENDERS)
  gender!: (typeof GENDERS)[number];
}

export class GraduateClassStudentsDto {
  @ApiProperty({
    description: '本班在读学生账户 ID（单个毕业即传一个）',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  studentIds!: string[];
}

export class CorrectStudentIdentityDto {
  @ApiPropertyOptional({
    description: '更正后的姓名（与性别至少提供一项）',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: '更正后的性别（与姓名至少提供一项）',
    required: false,
    enum: GENDERS,
  })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];
}

export class StudentSummaryDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ type: String })
  studentNumber!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ nullable: true, enum: ['MALE', 'FEMALE', 'UNSPECIFIED'] })
  gender!: 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: LIFECYCLE_STATES })
  lifecycleState!: (typeof LIFECYCLE_STATES)[number];

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  accountStatus!: (typeof ACCOUNT_STATUSES)[number];

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  classId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: '毕业时间（毕业活跃态起算，满 2 年转纯只读态）',
  })
  graduatedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class StudentListDto {
  @ApiProperty({ type: () => StudentSummaryDto, isArray: true })
  @Type(() => StudentSummaryDto)
  students!: StudentSummaryDto[];
}
