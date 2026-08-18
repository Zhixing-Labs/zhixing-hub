import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  Prisma,
  RecordStatus,
  StudentKind,
  StudentLifecycleState,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { OrganizationConflictError } from './organization-admin.service';
import {
  StudentCsvFailureReason,
  StudentCsvGender,
  parseStudentCsv,
} from '../domain/student-csv';

export type StudentImportFailureReason =
  | StudentCsvFailureReason
  | 'PHONE_ALREADY_USED'
  | 'STUDENT_NUMBER_ALREADY_USED';

export type PhoneOccupationSubjectType =
  | 'PLATFORM_STUDENT'
  | 'UNIVERSITY_STUDENT_CURRENT_TENANT'
  | 'UNIVERSITY_STUDENT_OTHER_TENANT'
  | 'UNIVERSITY_STAFF'
  | 'ENTERPRISE_MEMBER'
  | 'GOVERNMENT_ACCOUNT'
  | 'UNKNOWN';

export interface PhoneOccupation {
  subjectType: PhoneOccupationSubjectType;
  tenantName: string | null;
  studentNumber: string | null;
  guidance: string;
}

export interface StudentImportFailure {
  row: number;
  name: string | null;
  studentNumber: string | null;
  phone: string | null;
  reason: StudentImportFailureReason;
  detail: string;
  occupation?: PhoneOccupation;
}

export interface StudentImportResult {
  createdCount: number;
  failures: StudentImportFailure[];
}

export interface ImportClassStudentsInput {
  csv: string;
}

export class StudentImportDeniedError extends Error {
  constructor() {
    super('Only a counselor can import students into a managed class');
    this.name = 'StudentImportDeniedError';
  }
}

export class StudentImportClassNotFoundError extends Error {
  constructor() {
    super('Class managed by the current counselor was not found');
    this.name = 'StudentImportClassNotFoundError';
  }
}

const UNIVERSITY_STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.UNIVERSITY_ADMIN,
  MembershipRole.COLLEGE_ADMIN,
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
  MembershipRole.UNIVERSITY_DASHBOARD,
]);

const ENTERPRISE_ROLES = new Set<MembershipRole>([
  MembershipRole.ENTERPRISE_ADMIN,
  MembershipRole.HR,
  MembershipRole.PROJECT_LEAD,
  MembershipRole.MENTOR,
  MembershipRole.ENTERPRISE_DASHBOARD,
]);

const GOVERNMENT_ROLES = new Set<MembershipRole>([
  MembershipRole.GOVERNMENT_DASHBOARD_ADMIN,
  MembershipRole.GOVERNMENT_DASHBOARD,
]);

/**
 * 《07》第 5.3 节：辅导员按班级 CSV 导入学生。
 * 学生只能在班级上下文中创建，班级与专业由服务端绑定；逐行校验后
 * 合法行整批入库，失败行携带原因（手机号冲突附占用主体与处理指引）。
 */
@Injectable()
export class CounselorStudentImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async importClassStudents(
    classId: string,
    input: ImportClassStudentsInput,
  ): Promise<StudentImportResult> {
    const actor = await this.requireCounselorActor();
    // 班级上下文先行：找不到或非本人管辖一律 404，不区分暴露他班存在性
    const cohort = await this.prisma.cohortClass.findFirst({
      where: {
        id: classId,
        tenantId: actor.tenantId,
        status: RecordStatus.ACTIVE,
      },
      select: { id: true, counselorMembershipId: true },
    });
    if (!cohort || cohort.counselorMembershipId !== actor.membershipId) {
      throw new StudentImportClassNotFoundError();
    }

    const parsed = parseStudentCsv(input.csv);
    const failures: StudentImportFailure[] = [...parsed.failures];
    if (parsed.rows.length === 0) {
      return { createdCount: 0, failures };
    }

    const phones = [...new Set(parsed.rows.map((row) => row.phone))];
    const studentNumbers = [
      ...new Set(parsed.rows.map((row) => row.studentNumber)),
    ];
    const [occupiedAccounts, occupiedProfiles] = await Promise.all([
      this.prisma.account.findMany({
        where: { phone: { in: phones } },
        include: {
          membership: { include: { tenant: { select: { name: true } } } },
          studentProfile: true,
        },
      }),
      this.prisma.studentProfile.findMany({
        where: {
          tenantId: actor.tenantId,
          studentNumber: { in: studentNumbers },
        },
        select: { studentNumber: true },
      }),
    ]);
    const accountByPhone = new Map(
      occupiedAccounts
        .filter((account) => account.phone !== null)
        .map((account) => [account.phone!, account]),
    );
    const occupiedStudentNumbers = new Set(
      occupiedProfiles.map((profile) => profile.studentNumber!),
    );

    const importable: Array<{
      row: number;
      name: string;
      studentNumber: string;
      phone: string;
      gender: StudentCsvGender;
    }> = [];
    for (const row of parsed.rows) {
      // 学号在本校租户内终身不回收：任何现存档案（含毕业、停用）都视为占用
      if (occupiedStudentNumbers.has(row.studentNumber)) {
        failures.push({
          row: row.row,
          name: row.name,
          studentNumber: row.studentNumber,
          phone: row.phone,
          reason: 'STUDENT_NUMBER_ALREADY_USED',
          detail: '该学号在本校已存在（学号终身不回收，毕业与注销均不释放）',
        });
        continue;
      }
      const occupyingAccount = accountByPhone.get(row.phone);
      if (occupyingAccount) {
        failures.push({
          row: row.row,
          name: row.name,
          studentNumber: row.studentNumber,
          phone: row.phone,
          reason: 'PHONE_ALREADY_USED',
          detail: '该手机号已被其他账户占用',
          occupation: describePhoneOccupation(occupyingAccount, actor.tenantId),
        });
        continue;
      }
      importable.push(row);
    }

    if (importable.length > 0) {
      await this.persistRows(actor, cohort.id, importable);
    }
    failures.sort((left, right) => left.row - right.row);
    return { createdCount: importable.length, failures };
  }

  private async persistRows(
    actor: CounselorActor,
    classId: string,
    rows: Array<{
      row: number;
      name: string;
      studentNumber: string;
      phone: string;
      gender: StudentCsvGender;
    }>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        for (const row of rows) {
          await transaction.account.create({
            data: {
              kind: 'END_USER',
              phone: row.phone,
              username: null,
              displayName: row.name,
              gender: row.gender,
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
                  studentNumber: row.studentNumber,
                  lifecycleState: StudentLifecycleState.ENROLLED,
                  classId,
                },
              },
            },
          });
        }
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'university.students.imported',
            targetType: 'class',
            targetId: classId,
            requestId: actor.requestId,
            after: {
              createdCount: rows.length,
              students: rows.map((row) => ({
                studentNumber: row.studentNumber,
                name: row.name,
                phone: row.phone,
                sourceRow: row.row,
              })),
            },
          },
        });
      });
    } catch (error) {
      // 预检通过后的唯一键冲突只能来自并发导入，整文件回滚并按冲突上报
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new OrganizationConflictError(
          'Concurrent import changed phone or student number uniqueness; retry the CSV',
        );
      }
      throw error;
    }
  }

  private async requireCounselorActor(): Promise<CounselorActor> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.COUNSELOR
    ) {
      throw new StudentImportDeniedError();
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
      membership.account.kind !== 'END_USER' ||
      membership.tenant.type !== TenantType.UNIVERSITY
    ) {
      throw new StudentImportDeniedError();
    }

    return {
      accountId: membership.accountId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      requestId: current.requestId,
    };
  }
}

interface CounselorActor {
  accountId: string;
  membershipId: string;
  tenantId: string;
  requestId: string;
}

function describePhoneOccupation(
  account: Prisma.AccountGetPayload<{
    include: {
      membership: { include: { tenant: { select: { name: true } } } };
      studentProfile: true;
    };
  }>,
  universityTenantId: string,
): PhoneOccupation {
  const membership = account.membership;
  if (!membership) {
    return {
      subjectType: 'UNKNOWN',
      tenantName: null,
      studentNumber: null,
      guidance: '该手机号已被占用，请核对名册后重试',
    };
  }

  if (membership.role === MembershipRole.STUDENT) {
    if (account.studentProfile?.kind === StudentKind.PLATFORM) {
      return {
        subjectType: 'PLATFORM_STUDENT',
        tenantName: membership.tenant.name,
        studentNumber: null,
        guidance: '该号已注册为平台学员，请学生先自助注销后重导',
      };
    }
    if (
      account.studentProfile?.kind === StudentKind.UNIVERSITY_CERTIFIED
    ) {
      if (membership.tenantId === universityTenantId) {
        return {
          subjectType: 'UNIVERSITY_STUDENT_CURRENT_TENANT',
          tenantName: membership.tenant.name,
          studentNumber: account.studentProfile.studentNumber,
          guidance:
            '该号已是本校导入的学生，请核对名册或先处理原账户后重导',
        };
      }
      return {
        subjectType: 'UNIVERSITY_STUDENT_OTHER_TENANT',
        tenantName: membership.tenant.name,
        studentNumber: account.studentProfile.studentNumber,
        guidance: '该号已注册为其他高校认证学员，需由原校释放手机号后重导',
      };
    }
  }

  if (UNIVERSITY_STAFF_ROLES.has(membership.role)) {
    return {
      subjectType: 'UNIVERSITY_STAFF',
      tenantName: membership.tenant.name,
      studentNumber: null,
      guidance: '该号已注册为高校教职工账户，请该员换绑手机号后重导',
    };
  }
  if (ENTERPRISE_ROLES.has(membership.role)) {
    return {
      subjectType: 'ENTERPRISE_MEMBER',
      tenantName: membership.tenant.name,
      studentNumber: null,
      guidance: '该号已注册为企业成员，请本人换绑手机号后重导',
    };
  }
  if (GOVERNMENT_ROLES.has(membership.role)) {
    return {
      subjectType: 'GOVERNMENT_ACCOUNT',
      tenantName: membership.tenant.name,
      studentNumber: null,
      guidance: '该号已注册为政务端账户，请联系平台运营处理',
    };
  }
  return {
    subjectType: 'UNKNOWN',
    tenantName: membership.tenant.name,
    studentNumber: null,
    guidance: '该手机号已被占用，请核对名册后重试',
  };
}
