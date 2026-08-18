import { ApiProperty } from '@nestjs/swagger';

const TENANT_TYPES = [
  'PLATFORM',
  'UNIVERSITY',
  'ENTERPRISE',
  'GOVERNMENT',
] as const;

const RECORD_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export class CurrentOrganizationDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ enum: TENANT_TYPES })
  type!: (typeof TENANT_TYPES)[number];

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: RECORD_STATUSES })
  status!: (typeof RECORD_STATUSES)[number];
}
