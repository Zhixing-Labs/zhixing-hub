import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartTotpEnrollmentDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class StartedTotpEnrollmentDto {
  @ApiProperty({ type: String })
  secret!: string;

  @ApiProperty({ type: String })
  uri!: string;
}

export class ConfirmTotpEnrollmentDto {
  @ApiProperty({ type: String, writeOnly: true })
  @Matches(/^\d{6}$/)
  totpCode!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String] })
  recoveryCodes!: string[];
}

export class ChangePasswordDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @ApiProperty({
    description: '已启用 TOTP 时必填',
    required: false,
    type: String,
    writeOnly: true,
  })
  @IsOptional()
  @Matches(/^(?:\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$/)
  secondFactorCode?: string;
}

export class DisableTotpDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @Matches(/^(?:\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$/)
  secondFactorCode!: string;
}
