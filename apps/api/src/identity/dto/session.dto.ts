import { ApiProperty } from '@nestjs/swagger';

const ACCOUNT_KINDS = ['PLATFORM_ADMIN', 'END_USER'] as const;
const MEMBERSHIP_ROLES = [
  'SUPER_ADMIN',
  'ORGANIZATION_ADMIN',
  'OPERATIONS_SPECIALIST',
  'PLATFORM_DASHBOARD',
  'UNIVERSITY_ADMIN',
  'COLLEGE_ADMIN',
  'PROGRAM_LEAD',
  'COUNSELOR',
  'STUDENT',
  'UNIVERSITY_DASHBOARD',
  'ENTERPRISE_ADMIN',
  'HR',
  'PROJECT_LEAD',
  'MENTOR',
  'ENTERPRISE_DASHBOARD',
  'GOVERNMENT_DASHBOARD_ADMIN',
  'GOVERNMENT_DASHBOARD',
] as const;

export class SessionAccountDto {
  @ApiProperty({ format: 'uuid', type: String })
  accountId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ enum: ACCOUNT_KINDS })
  kind!: (typeof ACCOUNT_KINDS)[number];

  @ApiProperty({ format: 'uuid', type: String })
  tenantId!: string;

  @ApiProperty({ enum: MEMBERSHIP_ROLES })
  role!: (typeof MEMBERSHIP_ROLES)[number];
}

export class CreatedSessionDto {
  @ApiProperty({
    description: '用于同源写请求的 CSRF 双提交令牌',
    type: String,
  })
  csrfToken!: string;

  @ApiProperty({ format: 'date-time', type: String })
  expiresAt!: string;

  @ApiProperty({ type: () => SessionAccountDto })
  account!: SessionAccountDto;
}
