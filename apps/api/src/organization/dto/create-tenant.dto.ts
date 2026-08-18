import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InitialTenantAdminDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({
    description: '用户端管理员手机号；租户管理员不是平台管理账号',
    example: '13800138000',
    type: String,
  })
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;
}

export class CreateUniversityDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ type: () => InitialTenantAdminDto })
  @ValidateNested()
  @Type(() => InitialTenantAdminDto)
  initialAdmin!: InitialTenantAdminDto;
}

export class CreateEnterpriseDto extends CreateUniversityDto {
  @ApiProperty({ example: 'GENERAL', type: String })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  natureTagCode!: string;

  @ApiProperty({ example: 'I', type: String })
  @Matches(/^[A-Z0-9_-]{1,50}$/)
  industryCategoryCode!: string;

  @ApiProperty({
    description: '至少一个受控地级市行政区划代码',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  locationCodes!: string[];
}

export class CreateGovernmentDto extends CreateUniversityDto {
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(12)
  divisionCode!: string;

  @ApiProperty({
    description: '政务端允许聚合查看的高校租户白名单',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  visibleUniversityTenantIds!: string[];
}

export class CreatedTenantDto {
  @ApiProperty({ format: 'uuid', type: String })
  tenantId!: string;

  @ApiProperty({
    enum: ['UNIVERSITY', 'ENTERPRISE', 'GOVERNMENT'],
  })
  type!: 'UNIVERSITY' | 'ENTERPRISE' | 'GOVERNMENT';

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ format: 'uuid', type: String })
  initialAdminAccountId!: string;
}
