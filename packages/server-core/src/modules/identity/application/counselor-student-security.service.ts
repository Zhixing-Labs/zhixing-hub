import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
  StudentKind,
  StudentLifecycleState,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { TotpNotEnabledError } from './account-security.service';

export class CounselorRequiredError extends Error {
  constructor() {
    super('Only a class counselor can close a supervised student TOTP');
    this.name = 'CounselorRequiredError';
  }
}

export class StudentTotpReliefNotFoundError extends Error {
  constructor() {
    super(
      'Enrolled certified student with TOTP relief eligibility was not found',
    );
    this.name = 'StudentTotpReliefNotFoundError';
  }
}

@Injectable()
export class CounselorStudentSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async disableStudentTotp(studentAccountId: string): Promise<void> {
    const actor = await this.requireCounselor();
    const student = await this.prisma.account.findUnique({
      where: { id: studentAccountId },
      include: {
        membership: true,
        studentProfile: {
          include: { cohortClass: true },
        },
        totpCredential: true,
      },
    });
    if (
      !student ||
      student.kind !== 'END_USER' ||
      student.status !== AccountStatus.ACTIVE ||
      !student.membership ||
      student.membership.status !== RecordStatus.ACTIVE ||
      student.membership.tenantId !== actor.tenantId ||
      student.membership.role !== MembershipRole.STUDENT ||
      student.studentProfile?.kind !== StudentKind.UNIVERSITY_CERTIFIED ||
      student.studentProfile.lifecycleState !== StudentLifecycleState.ENROLLED ||
      student.studentProfile.cohortClass?.counselorMembershipId !==
        actor.membershipId
    ) {
      throw new StudentTotpReliefNotFoundError();
    }
    if (!student.totpCredential?.enabledAt) {
      throw new TotpNotEnabledError();
    }

    await this.prisma.$transaction([
      this.prisma.totpRecoveryCode.deleteMany({
        where: { accountId: studentAccountId },
      }),
      this.prisma.totpCredential.delete({
        where: { accountId: studentAccountId },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId: studentAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'student.totp.disabled_by_counselor',
          targetType: 'account',
          targetId: studentAccountId,
          requestId: actor.requestId,
        },
      }),
    ]);
  }

  private async requireCounselor(): Promise<{
    accountId: string;
    membershipId: string;
    tenantId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.COUNSELOR
    ) {
      throw new CounselorRequiredError();
    }

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      select: { id: true, tenantId: true, status: true, role: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== MembershipRole.COUNSELOR ||
      membership.status !== RecordStatus.ACTIVE
    ) {
      throw new CounselorRequiredError();
    }

    return {
      accountId: current.actorAccountId,
      membershipId: membership.id,
      tenantId: current.tenantId,
      requestId: current.requestId,
    };
  }
}
