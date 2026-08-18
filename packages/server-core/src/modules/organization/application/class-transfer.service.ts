import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ClassTransferStatus,
  MembershipRole,
  Prisma,
  RecordStatus,
  StudentKind,
  StudentLifecycleState,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';

export interface CreateClassTransferInput {
  targetClassId: string;
}

export interface ResolveClassTransferInput {
  approve: boolean;
}

export interface ClassTransferSummary {
  id: string;
  studentAccountId: string;
  fromClassId: string;
  toClassId: string;
  status: ClassTransferStatus;
  createdAt: Date;
  outgoingResolvedAt: Date | null;
  incomingResolvedAt: Date | null;
  resolvedAt: Date | null;
}

export class ClassTransferDeniedError extends Error {
  constructor(message = 'Current role cannot manage this class transfer') {
    super(message);
    this.name = 'ClassTransferDeniedError';
  }
}

export class ClassTransferNotFoundError extends Error {
  constructor(message = 'Class transfer request was not found') {
    super(message);
    this.name = 'ClassTransferNotFoundError';
  }
}

export class ClassTransferConflictError extends Error {
  constructor(message = 'Student already has an open class transfer request') {
    super(message);
    this.name = 'ClassTransferConflictError';
  }
}

export class ClassTransferInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassTransferInvalidError';
  }
}

const CLASS_WITH_MAJOR = {
  include: { major: true, counselor: { include: { account: true } } },
} as const;

type ClassWithMajor = Prisma.CohortClassGetPayload<typeof CLASS_WITH_MAJOR>;

/**
 * 同学院内转班（《07》6.1）：学生发起 → 转出辅导员同意 → 转入辅导员同意。
 * 无时限、悬挂不自动通过。审批绑定当时班级辅导员，以便岗位移交后由继任继续批。
 * 辅导员通道在途审核随班级走，Evidence 未建时生效步骤只改 `student_profile.class_id`。
 */
@Injectable()
export class ClassTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async listMine(): Promise<ClassTransferSummary[]> {
    const student = await this.requireStudent();
    const rows = await this.prisma.classTransferRequest.findMany({
      where: { studentAccountId: student.accountId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  async create(input: CreateClassTransferInput): Promise<ClassTransferSummary> {
    const student = await this.requireStudent();
    if (student.lifecycleState !== StudentLifecycleState.ENROLLED) {
      throw new ClassTransferInvalidError(
        'Only enrolled certified students can request a class transfer',
      );
    }
    if (!student.classId) {
      throw new ClassTransferInvalidError('Student is not assigned to a class');
    }
    if (input.targetClassId === student.classId) {
      throw new ClassTransferInvalidError(
        'Target class must differ from the current class',
      );
    }

    const [fromClass, toClass] = await Promise.all([
      this.loadActiveClass(student.tenantId, student.classId),
      this.loadActiveClass(student.tenantId, input.targetClassId),
    ]);
    if (fromClass.major.collegeId !== toClass.major.collegeId) {
      throw new ClassTransferInvalidError(
        'Class transfer is only allowed within the same college',
      );
    }
    assertClassHasActiveCounselor(fromClass);
    assertClassHasActiveCounselor(toClass);

    try {
      const created = await this.prisma.classTransferRequest.create({
        data: {
          tenantId: student.tenantId,
          studentAccountId: student.accountId,
          fromClassId: fromClass.id,
          toClassId: toClass.id,
        },
      });
      await this.prisma.auditEvent.create({
        data: {
          tenantId: student.tenantId,
          actorAccountId: student.accountId,
          action: 'university.class_transfer.requested',
          targetType: 'class_transfer_request',
          targetId: created.id,
          requestId: student.requestId,
          after: {
            fromClassId: fromClass.id,
            toClassId: toClass.id,
          },
        },
      });
      return toSummary(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ClassTransferConflictError();
      }
      throw error;
    }
  }

  async listPendingForCounselor(): Promise<ClassTransferSummary[]> {
    const actor = await this.requireCounselor();
    const rows = await this.prisma.classTransferRequest.findMany({
      where: {
        tenantId: actor.tenantId,
        OR: [
          {
            status: ClassTransferStatus.PENDING_OUTGOING,
            fromClass: { counselorMembershipId: actor.membershipId },
          },
          {
            status: ClassTransferStatus.PENDING_INCOMING,
            toClass: { counselorMembershipId: actor.membershipId },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSummary);
  }

  async resolve(
    requestId: string,
    input: ResolveClassTransferInput,
  ): Promise<ClassTransferSummary> {
    const actor = await this.requireCounselor();

    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.classTransferRequest.findFirst({
        where: { id: requestId, tenantId: actor.tenantId },
      });
      if (!request) {
        throw new ClassTransferNotFoundError();
      }
      if (
        request.status !== ClassTransferStatus.PENDING_OUTGOING &&
        request.status !== ClassTransferStatus.PENDING_INCOMING
      ) {
        throw new ClassTransferConflictError(
          'Class transfer request is no longer pending',
        );
      }

      const [fromClass, toClass] = await Promise.all([
        transaction.cohortClass.findFirst({
          where: { id: request.fromClassId, tenantId: actor.tenantId },
          ...CLASS_WITH_MAJOR,
        }),
        transaction.cohortClass.findFirst({
          where: { id: request.toClassId, tenantId: actor.tenantId },
          ...CLASS_WITH_MAJOR,
        }),
      ]);
      if (!fromClass || !toClass) {
        throw new ClassTransferNotFoundError();
      }
      assertClassHasActiveCounselor(fromClass);
      assertClassHasActiveCounselor(toClass);

      const expectedMembershipId =
        request.status === ClassTransferStatus.PENDING_OUTGOING
          ? fromClass.counselorMembershipId
          : toClass.counselorMembershipId;
      if (expectedMembershipId !== actor.membershipId) {
        throw new ClassTransferDeniedError();
      }

      const now = new Date();
      if (!input.approve) {
        const rejected = await transaction.classTransferRequest.update({
          where: { id: request.id },
          data: {
            status: ClassTransferStatus.REJECTED,
            outgoingResolvedAt:
              request.status === ClassTransferStatus.PENDING_OUTGOING
                ? now
                : request.outgoingResolvedAt,
            incomingResolvedAt:
              request.status === ClassTransferStatus.PENDING_INCOMING
                ? now
                : request.incomingResolvedAt,
            resolvedAt: now,
            resolvedByAccountId: actor.accountId,
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'university.class_transfer.rejected',
            targetType: 'class_transfer_request',
            targetId: request.id,
            requestId: actor.requestId,
            after: { step: request.status },
          },
        });
        return toSummary(rejected);
      }

      if (request.status === ClassTransferStatus.PENDING_OUTGOING) {
        const sameCounselor =
          fromClass.counselorMembershipId === toClass.counselorMembershipId;
        if (!sameCounselor) {
          const advanced = await transaction.classTransferRequest.update({
            where: { id: request.id },
            data: {
              status: ClassTransferStatus.PENDING_INCOMING,
              outgoingResolvedAt: now,
            },
          });
          await transaction.auditEvent.create({
            data: {
              tenantId: actor.tenantId,
              actorAccountId: actor.accountId,
              action: 'university.class_transfer.outgoing_approved',
              targetType: 'class_transfer_request',
              targetId: request.id,
              requestId: actor.requestId,
            },
          });
          return toSummary(advanced);
        }
      }

      const approved = await transaction.classTransferRequest.update({
        where: { id: request.id },
        data: {
          status: ClassTransferStatus.APPROVED,
          outgoingResolvedAt: request.outgoingResolvedAt ?? now,
          incomingResolvedAt: now,
          resolvedAt: now,
          resolvedByAccountId: actor.accountId,
        },
      });
      await transaction.studentProfile.update({
        where: { accountId: request.studentAccountId },
        data: { classId: request.toClassId },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'university.class_transfer.approved',
          targetType: 'class_transfer_request',
          targetId: request.id,
          requestId: actor.requestId,
          after: {
            fromClassId: request.fromClassId,
            toClassId: request.toClassId,
            studentAccountId: request.studentAccountId,
          },
        },
      });
      return toSummary(approved);
    });
  }

  private async loadActiveClass(
    tenantId: string,
    classId: string,
  ): Promise<ClassWithMajor> {
    const cohort = await this.prisma.cohortClass.findFirst({
      where: { id: classId, tenantId, status: RecordStatus.ACTIVE },
      ...CLASS_WITH_MAJOR,
    });
    if (!cohort) {
      throw new ClassTransferInvalidError('Target class was not found');
    }
    return cohort;
  }

  private async requireStudent(): Promise<{
    accountId: string;
    tenantId: string;
    classId: string | null;
    lifecycleState: StudentLifecycleState;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.STUDENT
    ) {
      throw new ClassTransferDeniedError();
    }

    const account = await this.prisma.account.findUnique({
      where: { id: current.actorAccountId },
      include: { membership: true, studentProfile: true },
    });
    if (
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.ACTIVE ||
      !account.membership ||
      account.membership.tenantId !== current.tenantId ||
      account.membership.role !== MembershipRole.STUDENT ||
      account.membership.status !== RecordStatus.ACTIVE ||
      !account.studentProfile ||
      account.studentProfile.kind !== StudentKind.UNIVERSITY_CERTIFIED
    ) {
      throw new ClassTransferDeniedError();
    }

    return {
      accountId: account.id,
      tenantId: account.membership.tenantId,
      classId: account.studentProfile.classId,
      lifecycleState: account.studentProfile.lifecycleState,
      requestId: current.requestId,
    };
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
      throw new ClassTransferDeniedError();
    }

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: { account: true, tenant: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== MembershipRole.COUNSELOR ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.tenant.type !== TenantType.UNIVERSITY
    ) {
      throw new ClassTransferDeniedError();
    }

    return {
      accountId: membership.accountId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      requestId: current.requestId,
    };
  }
}

function assertClassHasActiveCounselor(cohort: ClassWithMajor): void {
  if (
    !cohort.counselor ||
    cohort.counselor.status !== RecordStatus.ACTIVE ||
    cohort.counselor.account.status !== AccountStatus.ACTIVE
  ) {
    throw new ClassTransferInvalidError(
      'Both classes must have an active counselor',
    );
  }
}

function toSummary(row: {
  id: string;
  studentAccountId: string;
  fromClassId: string;
  toClassId: string;
  status: ClassTransferStatus;
  createdAt: Date;
  outgoingResolvedAt: Date | null;
  incomingResolvedAt: Date | null;
  resolvedAt: Date | null;
}): ClassTransferSummary {
  return {
    id: row.id,
    studentAccountId: row.studentAccountId,
    fromClassId: row.fromClassId,
    toClassId: row.toClassId,
    status: row.status,
    createdAt: row.createdAt,
    outgoingResolvedAt: row.outgoingResolvedAt,
    incomingResolvedAt: row.incomingResolvedAt,
    resolvedAt: row.resolvedAt,
  };
}
