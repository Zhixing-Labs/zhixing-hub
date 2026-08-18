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

export class CreateUserPasswordSessionDto {
  @ApiProperty({
    description: '用户端中国大陆手机号；平台管理账号不使用本入口',
    example: '13800138000',
    type: String,
  })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;

  @ApiProperty({ minLength: 8, type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

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
