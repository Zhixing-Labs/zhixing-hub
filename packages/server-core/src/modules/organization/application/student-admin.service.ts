import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  Gender,
  MembershipRole,
  Prisma,
  RecordStatus,
  StudentKind,
  StudentLifecycleState,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { assertStudentLifecycleTransition } from '../domain/student-lifecycle';
import {
  PhoneOccupation,
  describePhoneOccupation,
} from './counselor-student-import.service';

export interface CreateStudentInput {
  name: string;
  studentNumber: string;
  phone: string;
  gender: 'MALE' | 'FEMALE';
}

export interface GraduateStudentsInput {
  studentIds: string[];
}

export interface CorrectStudentIdentityInput {
  displayName?: string;
  gender?: 'MALE' | 'FEMALE';
}

export interface StudentSummary {
  accountId: string;
  studentNumber: string;
  displayName: string;
  gender: Gender | null;
  phone: string | null;
  lifecycleState: StudentLifecycleState;
  accountStatus: AccountStatus;
  classId: string | null;
  graduatedAt: Date | null;
  createdAt: Date;
}

export class StudentAdminDeniedError extends Error {
  constructor(message = 'Current role cannot manage university students') {
    super(message);
    this.name = 'StudentAdminDeniedError';
  }
}

export class StudentAdminNotFoundError extends Error {
  constructor(message = 'Student within the current scope was not found') {
    super(message);
    this.name = 'StudentAdminNotFoundError';
  }
}

export class StudentPhoneConflictError extends Error {
  constructor(readonly occupation: PhoneOccupation) {
    super(occupation.guidance);
    this.name = 'StudentPhoneConflictError';
  }
}

export class StudentNumberConflictError extends Error {
  constructor() {
    super(
      'Student number already exists in this university (numbers are never recycled)',
    );
    this.name = 'StudentNumberConflictError';
  }
}

export class StudentDeregisterNotAllowedError extends Error {
  constructor() {
    super('Only students in the suspended state can be deregistered');
    this.name = 'StudentDeregisterNotAllowedError';
  }
}

export class StudentIdentityCorrectionEmptyError extends Error {
  constructor() {
    super('At least one of displayName or gender must be provided');
    this.name = 'StudentIdentityCorrectionEmptyError';
  }
}

type StudentAdminRole =
  | typeof MembershipRole.UNIVERSITY_ADMIN
  | typeof MembershipRole.COLLEGE_ADMIN
  | typeof MembershipRole.PROGRAM_LEAD
  | typeof MembershipRole.COUNSELOR;

const LIST_ROLES = new Set<StudentAdminRole>([
  MembershipRole.UNIVERSITY_ADMIN,
  MembershipRole.COLLEGE_ADMIN,
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
]);

/**
 * 辅导员 / 院管的学生管理与生命周期操作（《07》第 3.2、4.2、5.2、6.4 节）。
 * 学生只能在班级上下文中创建；毕业、停用、注销全部走第 4.2 节状态机的
 * 唯一迁移表；注销前先把学号写入保留表（5.3：本校终身不回收）。
 */
@Injectable()
export class StudentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async listClassStudents(classId: string): Promise<StudentSummary[]> {
    const actor = await this.requireActor([...LIST_ROLES]);
    await this.loadScopedClass(actor, classId);

    const profiles = await this.prisma.studentProfile.findMany({
      where: {
        tenantId: actor.tenantId,
        classId,
        kind: StudentKind.UNIVERSITY_CERTIFIED,
      },
      include: { account: true },
      orderBy: { studentNumber: 'asc' },
    });
    return profiles.map(toSummary);
  }

  async createStudent(
    classId: string,
    input: CreateStudentInput,
  ): Promise<StudentSummary> {
    const actor = await this.requireActor([MembershipRole.COUNSELOR]);
    await this.loadScopedClass(actor, classId);

    const [occupiedAccount, occupiedProfile, retired] = await Promise.all([
      this.prisma.account.findUnique({
        where: { phone: input.phone },
        include: {
          membership: { include: { tenant: { select: { name: true } } } },
          studentProfile: true,
        },
      }),
      this.prisma.studentProfile.findFirst({
        where: {
          tenantId: actor.tenantId,
          studentNumber: input.studentNumber,
        },
        select: { id: true },
      }),
      this.prisma.retiredStudentNumber.findUnique({
        where: {
          tenantId_studentNumber: {
            tenantId: actor.tenantId,
            studentNumber: input.studentNumber,
          },
        },
        select: { id: true },
      }),
    ]);
    if (occupiedProfile || retired) {
      throw new StudentNumberConflictError();
    }
    if (occupiedAccount) {
      throw new StudentPhoneConflictError(
        describePhoneOccupation(occupiedAccount, actor.tenantId),
      );
    }

    const created = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.account.create({
        data: {
          kind: 'END_USER',
          phone: input.phone,
          username: null,
          displayName: input.name.trim(),
          gender: input.gender,
          status: AccountStatus.PENDING_ACTIVATION,
          membership: {
            create: {
              tenantId: actor.tenantId,
              role: MembershipRole.STUDENT,
            },
          },
          studentProfile: {
            create: {
              tenantId: actor.tenantId,
              kind: StudentKind.UNIVERSITY_CERTIFIED,
              studentNumber: input.studentNumber,
              lifecycleState: StudentLifecycleState.ENROLLED,
              classId,
            },
          },
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'university.student.created',
          targetType: 'account',
          targetId: account.id,
          requestId: actor.requestId,
          after: {
            classId,
            studentNumber: input.studentNumber,
            name: account.displayName,
            phone: input.phone,
          },
        },
      });
      return account;
    });
    return toSummaryFromAccount(created);
  }

  /** 辅导员按班级批量 / 单个毕业（《07》2.2、4.2）；常驻城市默认学院排序第一校区城市（4.3） */
  async graduateStudents(
    classId: string,
    input: GraduateStudentsInput,
  ): Promise<StudentSummary[]> {
    const actor = await this.requireActor([MembershipRole.COUNSELOR]);
    await this.loadScopedClass(actor, classId);

    const students = await this.prisma.account.findMany({
      where: {
        id: { in: input.studentIds },
        kind: 'END_USER',
        membership: { tenantId: actor.tenantId, role: MembershipRole.STUDENT },
        studentProfile: {
          tenantId: actor.tenantId,
          classId,
          kind: StudentKind.UNIVERSITY_CERTIFIED,
        },
      },
      include: { membership: true, studentProfile: true },
    });
    if (students.length !== input.studentIds.length) {
      throw new StudentAdminNotFoundError();
    }
    for (const student of students) {
      assertStudentLifecycleTransition(
        student.studentProfile!.lifecycleState,
        StudentLifecycleState.GRADUATE_ACTIVE,
      );
    }

    const residentCityCode = await this.resolveDefaultResidentCity(classId);
    const graduatedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const results: Prisma.AccountGetPayload<{
        include: { membership: true; studentProfile: true };
      }>[] = [];
      for (const student of students) {
        results.push(
          await transaction.account.update({
            where: { id: student.id },
            data: {
              studentProfile: {
                update: {
                  lifecycleState: StudentLifecycleState.GRADUATE_ACTIVE,
                  graduatedAt,
                  residentCityCode,
                },
              },
            },
            include: { membership: true, studentProfile: true },
          }),
        );
      }
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'university.students.graduated',
          targetType: 'class',
          targetId: classId,
          requestId: actor.requestId,
          after: {
            graduatedAt: graduatedAt.toISOString(),
            residentCityCode,
            students: students.map((student) => ({
              accountId: student.id,
              studentNumber: student.studentProfile!.studentNumber,
            })),
          },
        },
      });
      return results;
    });
    return updated.map(toSummaryFromAccount);
  }

  /** 辅导员学籍停用（退学 / 转学，《07》4.2）；在途项目清退随 Learning 阶段接线 */
  async suspendStudent(accountId: string): Promise<StudentSummary> {
    const actor = await this.requireActor([MembershipRole.COUNSELOR]);
    const student = await this.loadScopedStudent(actor, accountId, true);
    assertStudentLifecycleTransition(
      student.studentProfile!.lifecycleState,
      StudentLifecycleState.SUSPENDED,
    );

    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.account.update({
        where: { id: accountId },
        data: {
          studentProfile: {
            update: { lifecycleState: StudentLifecycleState.SUSPENDED },
          },
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'student.enrollment.suspended',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          after: { lifecycleState: StudentLifecycleState.SUSPENDED },
        },
      });
      return account;
    });
    return toSummaryFromAccount(updated);
  }

  /** 院级管理员确认恢复在读（误操作救济，《07》4.2、6.4 前置） */
  async restoreStudent(accountId: string): Promise<StudentSummary> {
    const actor = await this.requireActor([MembershipRole.COLLEGE_ADMIN]);
    const student = await this.loadScopedStudent(actor, accountId, false);
    assertStudentLifecycleTransition(
      student.studentProfile!.lifecycleState,
      StudentLifecycleState.ENROLLED,
    );

    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.account.update({
        where: { id: accountId },
        data: {
          studentProfile: {
            update: { lifecycleState: StudentLifecycleState.ENROLLED },
          },
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'student.enrollment.restored',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          after: { lifecycleState: StudentLifecycleState.ENROLLED },
        },
      });
      return account;
    });
    return toSummaryFromAccount(updated);
  }

  /** 院级管理员注销学籍停用态账户（《07》6.4）：删全部档案、释放手机号、学号保留不回收 */
  async deregisterStudent(accountId: string): Promise<void> {
    const actor = await this.requireActor([MembershipRole.COLLEGE_ADMIN]);
    const student = await this.loadScopedStudent(actor, accountId, false);
    if (student.studentProfile!.lifecycleState !== StudentLifecycleState.SUSPENDED) {
      throw new StudentDeregisterNotAllowedError();
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.retiredStudentNumber.create({
        data: {
          tenantId: actor.tenantId,
          studentNumber: student.studentProfile!.studentNumber!,
          studentName: student.displayName,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'student.account.deregistered',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          before: {
            studentNumber: student.studentProfile!.studentNumber,
            name: student.displayName,
            phone: student.phone,
            classId: student.studentProfile!.classId,
          },
        },
      });
      // 级联删除 membership、student_profile、会话、TOTP 与协议同意记录
      await transaction.account.delete({ where: { id: accountId } });
    });
  }

  /** 辅导员修改学生姓名 / 性别（《07》5.2 资料更正，学校名册为准） */
  async correctStudentIdentity(
    accountId: string,
    input: CorrectStudentIdentityInput,
  ): Promise<StudentSummary> {
    const actor = await this.requireActor([MembershipRole.COUNSELOR]);
    const student = await this.loadScopedStudent(actor, accountId, true);
    if (input.displayName === undefined && input.gender === undefined) {
      throw new StudentIdentityCorrectionEmptyError();
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.account.update({
        where: { id: accountId },
        data: {
          ...(input.displayName !== undefined
            ? { displayName: input.displayName.trim() }
            : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'student.identity.corrected',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          before: {
            displayName: student.displayName,
            gender: student.gender,
          },
          after: {
            displayName: account.displayName,
            gender: account.gender,
          },
        },
      });
      return account;
    });
    return toSummaryFromAccount(updated);
  }

  /** 学院校区列表排序第一的校区城市（学院校区有序维护，《07》4.3） */
  private async resolveDefaultResidentCity(
    classId: string,
  ): Promise<string | null> {
    const cohort = await this.prisma.cohortClass.findUnique({
      where: { id: classId },
      select: {
        major: {
          select: {
            college: {
              select: {
                campusLinks: {
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: { campus: { select: { divisionCode: true } } },
                },
              },
            },
          },
        },
      },
    });
    return cohort?.major.college.campusLinks[0]?.campus.divisionCode ?? null;
  }

  private async loadScopedClass(
    actor: StudentActor,
    classId: string,
  ): Promise<{
    id: string;
    majorId: string;
    counselorMembershipId: string | null;
  }> {
    const cohort = await this.prisma.cohortClass.findFirst({
      where: {
        id: classId,
        tenantId: actor.tenantId,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        majorId: true,
        counselorMembershipId: true,
        major: { select: { collegeId: true } },
      },
    });
    if (!cohort) {
      throw new StudentAdminNotFoundError('Class was not found');
    }
    if (
      actor.role === MembershipRole.COUNSELOR &&
      cohort.counselorMembershipId !== actor.membershipId
    ) {
      throw new StudentAdminNotFoundError('Class was not found');
    }
    if (
      (actor.role === MembershipRole.COLLEGE_ADMIN ||
        actor.role === MembershipRole.PROGRAM_LEAD) &&
      cohort.major.collegeId !== actor.collegeId
    ) {
      throw new StudentAdminNotFoundError('Class was not found');
    }
    return cohort;
  }

  private async loadScopedStudent(
    actor: StudentActor,
    accountId: string,
    requireCounselorOfClass: boolean,
  ) {
    const student = await this.prisma.account.findFirst({
      where: { id: accountId, kind: 'END_USER' },
      include: {
        membership: true,
        studentProfile: {
          include: { cohortClass: { include: { major: true } } },
        },
      },
    });
    const profile = student?.studentProfile;
    if (
      !student ||
      !student.membership ||
      student.membership.tenantId !== actor.tenantId ||
      student.membership.role !== MembershipRole.STUDENT ||
      !profile ||
      profile.kind !== StudentKind.UNIVERSITY_CERTIFIED ||
      profile.tenantId !== actor.tenantId
    ) {
      throw new StudentAdminNotFoundError();
    }
    const collegeId = profile.cohortClass?.major.collegeId ?? null;
    if (requireCounselorOfClass) {
      if (profile.cohortClass?.counselorMembershipId !== actor.membershipId) {
        throw new StudentAdminNotFoundError();
      }
    } else if (
      actor.role === MembershipRole.COLLEGE_ADMIN &&
      collegeId !== actor.collegeId
    ) {
      throw new StudentAdminNotFoundError();
    }
    return student;
  }

  private async requireActor(
    allowedRoles: StudentAdminRole[],
  ): Promise<StudentActor> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      !current.role ||
      !allowedRoles.includes(current.role as StudentAdminRole)
    ) {
      throw new StudentAdminDeniedError();
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
      throw new StudentAdminDeniedError();
    }
    if (
      membership.role === MembershipRole.COLLEGE_ADMIN &&
      !membership.collegeId
    ) {
      throw new StudentAdminDeniedError();
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

interface StudentActor {
  accountId: string;
  membershipId: string;
  tenantId: string;
  role: MembershipRole;
  collegeId: string | null;
  requestId: string;
}

type StudentAccountWithRelations = Prisma.AccountGetPayload<{
  include: { membership: true; studentProfile: true };
}>;

function toSummaryFromAccount(
  account: StudentAccountWithRelations,
): StudentSummary {
  return {
    accountId: account.id,
    studentNumber: account.studentProfile?.studentNumber ?? '',
    displayName: account.displayName,
    gender: account.gender,
    phone: account.phone,
    lifecycleState:
      account.studentProfile?.lifecycleState ?? StudentLifecycleState.ENROLLED,
    accountStatus: account.status,
    classId: account.studentProfile?.classId ?? null,
    graduatedAt: account.studentProfile?.graduatedAt ?? null,
    createdAt: account.createdAt,
  };
}

function toSummary(
  profile: Prisma.StudentProfileGetPayload<{ include: { account: true } }>,
): StudentSummary {
  return {
    accountId: profile.accountId,
    studentNumber: profile.studentNumber ?? '',
    displayName: profile.account.displayName,
    gender: profile.account.gender,
    phone: profile.account.phone,
    lifecycleState: profile.lifecycleState,
    accountStatus: profile.account.status,
    classId: profile.classId,
    graduatedAt: profile.graduatedAt,
    createdAt: profile.createdAt,
  };
}
