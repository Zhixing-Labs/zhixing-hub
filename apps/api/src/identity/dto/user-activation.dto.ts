import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CaptchaChallengeDto {
  @ApiProperty({ type: String })
  token!: string;

  @ApiProperty({ type: Boolean })
  mock!: boolean;
}

export class RequestUserActivationCodeDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ type: String })
  @IsString()
  captchaToken!: string;
}

export class ActivationCodeDeliveryDto {
  @ApiProperty({ type: String })
  messageId!: string;

  @ApiProperty({ type: Boolean })
  mock!: boolean;

  @ApiProperty({
    description: '仅 Mock 环境返回，正式短信适配器不包含此字段',
    required: false,
    type: String,
  })
  debugCode?: string;
}

export class ConfirmUserActivationDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ minLength: 8, type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    description: '当前用户协议与隐私政策版本 ID；首次部署未发布时为空数组',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  consentDocumentVersionIds!: string[];
}

export class RequestSmsLoginCodeDto extends RequestUserActivationCodeDto {}

export class SmsLoginCodeDeliveryDto extends ActivationCodeDeliveryDto {
  @ApiProperty({
    description: '该账号已绑定 TOTP，确认短信码时还须提交第二因子',
    type: Boolean,
  })
  secondFactorRequired!: boolean;
}

export class ConfirmSmsLoginDto {
  @ApiProperty({ example: '13800138000', type: String })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({
    description: '账号已绑定 TOTP 时必填：六位动态码或一次性恢复码',
    required: false,
    type: String,
    writeOnly: true,
  })
  @IsOptional()
  @Matches(/^(?:\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$/)
  secondFactorCode?: string;

  @ApiProperty({
    description: '当前用户协议与隐私政策版本 ID；首次部署未发布时为空数组',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  consentDocumentVersionIds!: string[];
}

export class CurrentLegalDocumentDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ enum: ['USER_AGREEMENT', 'PRIVACY_POLICY'] })
  type!: 'USER_AGREEMENT' | 'PRIVACY_POLICY';

  @ApiProperty({ type: String })
  version!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String })
  contentHash!: string;

  @ApiProperty({ format: 'date-time', type: String })
  publishedAt!: string;
}
