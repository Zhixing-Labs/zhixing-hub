import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

const IMPORT_FAILURE_REASONS = [
  'INVALID_ROW',
  'INVALID_NAME',
  'INVALID_STUDENT_NUMBER',
  'INVALID_PHONE',
  'INVALID_GENDER',
  'DUPLICATE_STUDENT_NUMBER_IN_FILE',
  'DUPLICATE_PHONE_IN_FILE',
  'PHONE_ALREADY_USED',
  'STUDENT_NUMBER_ALREADY_USED',
] as const;

const PHONE_OCCUPATION_SUBJECT_TYPES = [
  'PLATFORM_STUDENT',
  'UNIVERSITY_STUDENT_CURRENT_TENANT',
  'UNIVERSITY_STUDENT_OTHER_TENANT',
  'UNIVERSITY_STAFF',
  'ENTERPRISE_MEMBER',
  'GOVERNMENT_ACCOUNT',
  'UNKNOWN',
] as const;

export class ImportClassStudentsDto {
  @ApiProperty({
    description:
      'UTF-8 CSV 全文（原始文件只在请求内解析，不落对象存储）。表头必须为「姓名,学号,手机号,性别」，字段一律必填；性别只接受男 / 女；单次至多 2000 行。班级由路径参数绑定，CSV 无班级字段。',
    example: '姓名,学号,手机号,性别\n林晓,2026010101,13800138001,女',
    type: String,
  })
  @IsString()
  @MaxLength(1_000_000)
  csv!: string;
}

export class PhoneOccupationDto {
  @ApiProperty({ enum: PHONE_OCCUPATION_SUBJECT_TYPES })
  subjectType!: (typeof PHONE_OCCUPATION_SUBJECT_TYPES)[number];

  @ApiProperty({
    description: '占用该手机号的主体所在租户名称（可识别学校 / 企业）',
    nullable: true,
    type: String,
  })
  tenantName!: string | null;

  @ApiProperty({
    description: '占用者为高校认证学员时的学号（本校占用时用于核对名册）',
    nullable: true,
    type: String,
  })
  studentNumber!: string | null;

  @ApiProperty({
    description: '处理指引（如：该号已注册为平台学员，请学生先自助注销后重导）',
    type: String,
  })
  guidance!: string;
}

export class StudentImportFailureDto {
  @ApiProperty({
    description: '物理记录行号（含表头，从 2 起）',
    type: Number,
  })
  row!: number;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String })
  studentNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: IMPORT_FAILURE_REASONS })
  reason!: (typeof IMPORT_FAILURE_REASONS)[number];

  @ApiProperty({ description: '失败原因说明（面向辅导员的中文文案）', type: String })
  detail!: string;

  @ApiProperty({
    description: '仅 PHONE_ALREADY_USED 提供：手机号占用主体类型与处理指引',
    required: false,
    type: () => PhoneOccupationDto,
  })
  occupation?: PhoneOccupationDto;
}

export class StudentImportResultDto {
  @ApiProperty({
    description: '成功导入并创建的学生数（其余失败行见 failures）',
    type: Number,
  })
  createdCount!: number;

  @ApiProperty({ type: () => StudentImportFailureDto, isArray: true })
  failures!: StudentImportFailureDto[];
}
