import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

const CLASS_TRANSFER_STATUSES = [
  'PENDING_OUTGOING',
  'PENDING_INCOMING',
  'APPROVED',
  'REJECTED',
] as const;

const STAFF_ROLES = [
  'UNIVERSITY_DASHBOARD',
  'COLLEGE_ADMIN',
  'PROGRAM_LEAD',
  'COUNSELOR',
] as const;

export class HandoverUniversityMemberDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  successorMembershipId!: string;
}

export class StaffHandoverResultDto {
  @ApiProperty({ format: 'uuid', type: String })
  fromMembershipId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  toMembershipId!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  role!: (typeof STAFF_ROLES)[number];

  @ApiProperty({ type: Number })
  reassignedClassCount!: number;
}

export class CreateClassTransferDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  targetClassId!: string;
}

export class ResolveClassTransferDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  approve!: boolean;
}

export class ClassTransferRequestDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  studentAccountId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  fromClassId!: string;

  @ApiProperty({ format: 'uuid', type: String })
  toClassId!: string;

  @ApiProperty({ enum: CLASS_TRANSFER_STATUSES })
  status!: (typeof CLASS_TRANSFER_STATUSES)[number];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  outgoingResolvedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  incomingResolvedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  resolvedAt!: Date | null;
}
