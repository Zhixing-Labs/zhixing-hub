import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const MANAGED_PLATFORM_ROLES = [
  'ORGANIZATION_ADMIN',
  'OPERATIONS_SPECIALIST',
  'PLATFORM_DASHBOARD',
] as const;

export class CreatePlatformAccountDto {
  @ApiProperty({ type: String })
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({ enum: MANAGED_PLATFORM_ROLES })
  @IsIn(MANAGED_PLATFORM_ROLES)
  role!: (typeof MANAGED_PLATFORM_ROLES)[number];
}

export class PlatformAccountSummaryDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ type: String })
  username!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ enum: MANAGED_PLATFORM_ROLES })
  role!: (typeof MANAGED_PLATFORM_ROLES)[number];

  @ApiProperty({ enum: ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED'] })
  status!: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED';
}

export class CreatedPlatformAccountDto extends PlatformAccountSummaryDto {
  @ApiProperty({
    description: '仅本次响应展示，由超管安全交付给账号本人',
    minLength: 12,
    readOnly: true,
    type: String,
  })
  initialPassword!: string;
}

export class StartPlatformEnrollmentDto {
  @ApiProperty({ type: String })
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  initialPassword!: string;
}

export class StartedPlatformEnrollmentDto {
  @ApiProperty({ type: String })
  enrollmentToken!: string;

  @ApiProperty({
    description: '仅本次响应展示，供无法扫码时手工录入验证器',
    type: String,
  })
  totpSecret!: string;

  @ApiProperty({
    description: '供验证器扫码或导入的 otpauth URI',
    type: String,
  })
  totpUri!: string;

  @ApiProperty({ format: 'date-time', type: String })
  expiresAt!: string;
}

export class ConfirmPlatformEnrollmentDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  enrollmentToken!: string;

  @ApiProperty({ minLength: 12, type: String, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @Matches(/^\d{6}$/)
  totpCode!: string;
}

export class ConfirmedPlatformEnrollmentDto {
  @ApiProperty({
    description: '确认恢复码已保存时使用的一次性短效令牌',
    type: String,
  })
  recoveryCodesConfirmationToken!: string;

  @ApiProperty({ format: 'date-time', type: String })
  expiresAt!: string;

  @ApiProperty({
    description: '仅本次响应展示，须立即离线保存',
    type: [String],
  })
  recoveryCodes!: string[];
}

export class FinishPlatformEnrollmentDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  recoveryCodesConfirmationToken!: string;

  @ApiProperty({
    description: '必须明确确认恢复码已离线保存，方可激活并签发会话',
    enum: [true],
  })
  @IsBoolean()
  @Equals(true)
  recoveryCodesSaved!: true;

  @ApiProperty({
    description: '当前用户协议与隐私政策版本 ID；首次部署未发布时为空数组',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  consentDocumentVersionIds!: string[];
}
