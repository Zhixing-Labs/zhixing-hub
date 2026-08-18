import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePlatformSessionDto {
  @ApiProperty({
    description: '平台管理账号唯一用户名；平台账号不绑定手机号',
    example: 'super-admin',
    type: String,
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @ApiProperty({ minLength: 8, type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    description: '验证器六位动态码或一次性恢复码',
    example: '123456',
    type: String,
    writeOnly: true,
  })
  @IsString()
  @Matches(/^(?:\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$/)
  secondFactorCode!: string;

  @ApiProperty({
    description: '当前用户协议与隐私政策版本 ID；首次部署未发布时为空数组',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  consentDocumentVersionIds!: string[];
}
