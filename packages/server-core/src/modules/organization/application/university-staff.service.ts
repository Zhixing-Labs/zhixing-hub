import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import {
  OrganizationReferenceNotFoundError,
} from './organization-admin.service';
import {
  UniversityOrganizationDeniedError,
  UniversityOrganizationNotFoundError,
  UniversityStaffRole,
} from './university-organization.service';

const COLLEGE_SCOPED_STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.COLLEGE_ADMIN,
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
]);

const MANAGEABLE_STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.UNIVERSITY_DASHBOARD,
  MembershipRole.COLLEGE_ADMIN,
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
]);

const HANDOVER_ROLES = new Set<MembershipRole>([
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
]);

export interface HandoverStaffInput {
  successorMembershipId: string;
}

export interface StaffHandoverResult {
  fromMembershipId: string;
  toMembershipId: string;
  role: UniversityStaffRole;
  reassignedClassCount: number;
}

export class StaffHandoverRequiredError extends Error {
  constructor(
    message = 'Complete post handover before disabling this staff member',
  ) {
    super(message);
    this.name = 'StaffHandoverRequiredError';
  }
}

/**
 * 高校教职工岗位移交与停用（《07》5.7）。
 * 辅导员：停用前须把全部班级（含已毕业年级）改配他人。
 * 专业负责人：Learning 落地前只记录继任，不搬课程目录 / 引入审批。
 * 辅导员通道在途审核随班级 `counselorMembershipId` 走，Evidence 未建时无额外行。
 */
@Injectable()
export class UniversityStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async handover(
    membershipId: string,
    input: HandoverStaffInput,
  ): Promise<StaffHandoverResult> {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const target = await this.loadManagedStaff(actor, membershipId);
    if (!HANDOVER_ROLES.has(target.role)) {
      throw new UniversityOrganizationDeniedError(
        'Only counselor and program lead posts can be handed over',
      );
    }
    if (input.successorMembershipId === target.id) {
      throw new OrganizationReferenceNotFoundError(
        'Successor must be a different active member in the same college',
      );
    }

    const successor = await this.prisma.membership.findFirst({
      where: {
        id: input.successorMembershipId,
        tenantId: actor.tenantId,
        collegeId: target.collegeId,
        role: target.role,
        status: RecordStatus.ACTIVE,
        account: { status: AccountStatus.ACTIVE, kind: 'END_USER' },
      },
    });
    if (!successor) {
      throw new OrganizationReferenceNotFoundError(
        'Successor must be a different active member in the same college',
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      let reassignedClassCount = 0;
      if (target.role === MembershipRole.COUNSELOR) {
        const updated = await transaction.cohortClass.updateMany({
          where: {
            tenantId: actor.tenantId,
            counselorMembershipId: target.id,
          },
          data: { counselorMembershipId: successor.id },
        });
        reassignedClassCount = updated.count;
      }

      await transaction.staffPostHandover.upsert({
        where: { fromMembershipId: target.id },
        create: {
          tenantId: actor.tenantId,
          fromMembershipId: target.id,
          toMembershipId: successor.id,
        },
        update: { toMembershipId: successor.id },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'university.member.handed_over',
          targetType: 'membership',
          targetId: target.id,
          requestId: actor.requestId,
          after: {
            role: target.role,
            fromMembershipId: target.id,
            toMembershipId: successor.id,
            reassignedClassCount,
          },
        },
      });

      return {
        fromMembershipId: target.id,
        toMembershipId: successor.id,
        role: target.role as UniversityStaffRole,
        reassignedClassCount,
      };
    });
    return result;
  }

  async disable(membershipId: string): Promise<void> {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const target = await this.loadManagedStaff(actor, membershipId);
    if (target.accountId === actor.accountId) {
      throw new UniversityOrganizationDeniedError(
        'Staff cannot disable their own account',
      );
    }

    if (target.role === MembershipRole.COUNSELOR) {
      const classCount = await this.prisma.cohortClass.count({
        where: {
          tenantId: actor.tenantId,
          counselorMembershipId: target.id,
        },
      });
      if (classCount > 0) {
        throw new StaffHandoverRequiredError(
          'Counselor still holds classes; complete handover before disable',
        );
      }
    }

    if (target.role === MembershipRole.PROGRAM_LEAD) {
      const handover = await this.prisma.staffPostHandover.findUnique({
        where: { fromMembershipId: target.id },
      });
      if (!handover) {
        throw new StaffHandoverRequiredError(
          'Program lead has not completed post handover',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: target.accountId },
        data: {
          status: AccountStatus.SUSPENDED,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.membership.update({
        where: { id: target.id },
        data: { status: RecordStatus.DISABLED },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId: target.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'university.member.disabled',
          targetType: 'account',
          targetId: target.accountId,
          requestId: actor.requestId,
          before: {
            status: target.account.status,
            membershipStatus: target.status,
          },
          after: {
            status: AccountStatus.SUSPENDED,
            membershipStatus: RecordStatus.DISABLED,
          },
        },
      }),
    ]);
  }

  private async loadManagedStaff(
    actor: UniversityActor,
    membershipId: string,
  ) {
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: actor.tenantId },
      include: { account: true },
    });
    if (
      !target ||
      !MANAGEABLE_STAFF_ROLES.has(target.role) ||
      target.status !== RecordStatus.ACTIVE
    ) {
      throw new UniversityOrganizationNotFoundError();
    }
    if (!canManageRole(actor.role, target.role)) {
      throw new UniversityOrganizationDeniedError();
    }
    if (
      actor.role === MembershipRole.COLLEGE_ADMIN &&
      actor.collegeId !== target.collegeId
    ) {
      throw new UniversityOrganizationDeniedError();
    }
    return target;
  }

  private async requireActor(
    allowedRoles: MembershipRole[],
  ): Promise<UniversityActor> {
    const current = this.context.requireCurrent();
    if (!current.actorAccountId || !current.tenantId || !current.role) {
      throw new UniversityOrganizationDeniedError();
    }
    if (!allowedRoles.includes(current.role)) {
      throw new UniversityOrganizationDeniedError();
    }

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: { account: true, tenant: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== current.role ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.account.kind !== 'END_USER' ||
      membership.tenant.type !== TenantType.UNIVERSITY
    ) {
      throw new UniversityOrganizationDeniedError();
    }
    if (
      membership.role === MembershipRole.COLLEGE_ADMIN &&
      !membership.collegeId
    ) {
      throw new UniversityOrganizationDeniedError();
    }

    return {
      accountId: membership.accountId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      role: membership.role,
      collegeId: membership.collegeId,
      requestId: current.requestId,
    };
  }
}

interface UniversityActor {
  accountId: string;
  membershipId: string;
  tenantId: string;
  role: MembershipRole;
  collegeId: string | null;
  requestId: string;
}

function canManageRole(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
): boolean {
  if (actorRole === MembershipRole.UNIVERSITY_ADMIN) {
    return (
      targetRole === MembershipRole.UNIVERSITY_DASHBOARD ||
      COLLEGE_SCOPED_STAFF_ROLES.has(targetRole)
    );
  }
  return (
    actorRole === MembershipRole.COLLEGE_ADMIN &&
    (targetRole === MembershipRole.PROGRAM_LEAD ||
      targetRole === MembershipRole.COUNSELOR)
  );
}
