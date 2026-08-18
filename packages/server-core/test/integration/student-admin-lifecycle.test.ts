import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import {
  StudentDeregisterNotAllowedError,
  StudentIdentityCorrectionEmptyError,
  StudentNumberConflictError,
  StudentPhoneConflictError,
} from '../../src/modules/organization/application/student-admin.service';
import { StudentAdminService } from '../../src/modules/organization/application/student-admin.service';
import { CounselorStudentImportService } from '../../src/modules/organization/application/counselor-student-import.service';
import { UniversityOrganizationService } from '../../src/modules/organization/application/university-organization.service';
import { InvalidStudentLifecycleTransitionError } from '../../src/modules/organization/domain/student-lifecycle';

const prisma = new PrismaService();
const requestContext = new RequestContextService();
const universityOrganization = new UniversityOrganizationService(
  prisma,
  requestContext,
);
const studentImport = new CounselorStudentImportService(prisma, requestContext);
const studentAdmin = new StudentAdminService(prisma, requestContext);

const universityTenantId = '10000000-0000-4000-8000-000000000401';
const universityAdminAccountId = '20000000-0000-4000-8000-000000000401';
const counselorPhone = '13700137401';
const CSV_HEADER = '姓名,学号,手机号,性别\n';

let collegeId = '';
let classId = '';
let otherClassId = '';
let collegeAdminAccountId = '';
let counselorAccountId = '';
let otherCounselorAccountId = '';
let programLeadAccountId = '';

describe('Student admin and lifecycle', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const [code, name, parent] of [
      ['640000', '宁夏回族自治区', null],
      ['640100', '银川市', '640000'],
      ['640200', '石嘴山市', '640000'],
    ] as const) {
      await prisma.administrativeDivision.upsert({
        where: { code },
        create: {
          code,
          name,
          level: parent ? 'PREFECTURE' : 'PROVINCE',
          parentCode: parent,
          active: true,
        },
        update: {},
      });
    }
    await seedUniversityTree();
  });

  afterEach(cleanFixturesStudents);
  afterAll(async () => {
    await cleanFixturesStudents();
    await cleanFixturesTree();
    await prisma.$disconnect();
  });

  it('辅导员单个创建学生：字段入库、冲突按占用主体回报，多角色可见列表', async () => {
    const created = await asCounselor(() =>
      studentAdmin.createStudent(classId, {
        name: '张三',
        studentNumber: '2026020101',
        phone: '13822220001',
        gender: 'MALE',
      }),
    );
    expect(created).toMatchObject({
      studentNumber: '2026020101',
      displayName: '张三',
      gender: 'MALE',
      phone: '13822220001',
      lifecycleState: 'ENROLLED',
      accountStatus: 'PENDING_ACTIVATION',
      classId,
    });

    await expect(
      asCounselor(() =>
        studentAdmin.createStudent(classId, {
          name: '李四',
          studentNumber: '2026020101',
          phone: '13822220002',
          gender: 'FEMALE',
        }),
      ),
    ).rejects.toThrow(StudentNumberConflictError);

    await expect(
      asCounselor(() =>
        studentAdmin.createStudent(classId, {
          name: '王五',
          studentNumber: '2026020102',
          phone: counselorPhone,
          gender: 'MALE',
        }),
      ),
    ).rejects.toMatchObject({
      name: 'StudentPhoneConflictError',
      occupation: { subjectType: 'UNIVERSITY_STAFF' },
    });

    // 校管 / 院管 / 专业负责人 / 本班辅导员均可见；他班辅导员不可见
    for (const helper of [asUniversityAdmin, asCollegeAdmin, asProgramLead]) {
      const list = await helper(() => studentAdmin.listClassStudents(classId));
      expect(list.map((student) => student.studentNumber)).toContain(
        '2026020101',
      );
    }
    await expect(
      asOtherCounselor(() => studentAdmin.listClassStudents(classId)),
    ).rejects.toThrow('Class was not found');
    await expect(
      asOtherCounselor(() =>
        studentAdmin.createStudent(classId, {
          name: '赵六',
          studentNumber: '2026020103',
          phone: '13822220003',
          gender: 'FEMALE',
        }),
      ),
    ).rejects.toThrow('Class was not found');
  });

  it('批量毕业置毕业活跃态并默认常驻城市为学院排序第一校区，非在读拒绝', async () => {
    const [first, second] = await seedTwoStudents('20260202', '1382222010');
    const graduated = await asCounselor(() =>
      studentAdmin.graduateStudents(classId, {
        studentIds: [first.accountId, second.accountId],
      }),
    );
    expect(graduated).toHaveLength(2);
    for (const student of graduated) {
      expect(student.lifecycleState).toBe('GRADUATE_ACTIVE');
      expect(student.graduatedAt).not.toBeNull();
    }
    const profiles = await prisma.studentProfile.findMany({
      where: { accountId: { in: [first.accountId, second.accountId] } },
    });
    // 学院校区列表 [石嘴山校区, 银川校区]，排序第一 = 石嘴山（640200）
    expect(profiles.map((profile) => profile.residentCityCode)).toEqual([
      '640200',
      '640200',
    ]);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { action: 'university.students.graduated', targetId: classId },
      }),
    ).resolves.toBeTruthy();

    await expect(
      asCounselor(() =>
        studentAdmin.graduateStudents(classId, {
          studentIds: [first.accountId],
        }),
      ),
    ).rejects.toThrow(InvalidStudentLifecycleTransitionError);

    await expect(
      asCounselor(() =>
        studentAdmin.graduateStudents(otherClassId, {
          studentIds: [first.accountId],
        }),
      ),
    ).rejects.toThrow('Class was not found');
  });

  it('停用 → 恢复 → 注销闭环：释放手机号、学号保留不回收', async () => {
    const student = await seedTwoStudents('20260203', '1382222020');
    const target = student[0]!;

    // 辅导员停用；院管不可停用
    const suspended = await asCounselor(() =>
      studentAdmin.suspendStudent(target.accountId),
    );
    expect(suspended.lifecycleState).toBe('SUSPENDED');
    // 学籍停用可登录、只读本人档案：不触碰账户状态（导入学生尚未激活）
    expect(suspended.accountStatus).toBe('PENDING_ACTIVATION');
    await expect(
      asCollegeAdmin(() => studentAdmin.suspendStudent(target.accountId)),
    ).rejects.toThrow('Current role cannot manage university students');

    // 院管恢复；辅导员不可恢复
    const restored = await asCollegeAdmin(() =>
      studentAdmin.restoreStudent(target.accountId),
    );
    expect(restored.lifecycleState).toBe('ENROLLED');
    await expect(
      asCounselor(() => studentAdmin.restoreStudent(target.accountId)),
    ).rejects.toThrow('Current role cannot manage university students');

    // 在读态不可直接注销（出口只对学籍停用态开放）
    await expect(
      asCollegeAdmin(() => studentAdmin.deregisterStudent(target.accountId)),
    ).rejects.toThrow(StudentDeregisterNotAllowedError);

    // 再停用后注销：档案删除、手机号释放、学号保留
    await asCounselor(() => studentAdmin.suspendStudent(target.accountId));
    await asCollegeAdmin(() =>
      studentAdmin.deregisterStudent(target.accountId),
    );
    await expect(
      prisma.account.findUnique({ where: { id: target.accountId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.retiredStudentNumber.findUniqueOrThrow({
        where: {
          tenantId_studentNumber: {
            tenantId: universityTenantId,
            studentNumber: target.studentNumber,
          },
        },
      }),
    ).resolves.toMatchObject({ studentName: '张三' });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'student.account.deregistered',
          targetId: target.accountId,
        },
      }),
    ).resolves.toBeTruthy();

    // 手机号可被新学生使用，学号不行
    await expect(
      asCounselor(() =>
        studentAdmin.createStudent(classId, {
          name: '钱八',
          studentNumber: '2026020399',
          phone: target.phone,
          gender: 'MALE',
        }),
      ),
    ).resolves.toMatchObject({ phone: target.phone });
    await expect(
      asCounselor(() =>
        studentAdmin.createStudent(classId, {
          name: '孙九',
          studentNumber: target.studentNumber,
          phone: '1382222029',
          gender: 'FEMALE',
        }),
      ),
    ).rejects.toThrow(StudentNumberConflictError);
  });

  it('辅导员更正姓名与性别并留审计；他班辅导员与空更正被拒绝', async () => {
    const student = await seedTwoStudents('20260204', '1382222040');
    const target = student[0]!;

    const corrected = await asCounselor(() =>
      studentAdmin.correctStudentIdentity(target.accountId, {
        displayName: '张三丰',
        gender: 'FEMALE',
      }),
    );
    expect(corrected.displayName).toBe('张三丰');
    expect(corrected.gender).toBe('FEMALE');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        action: 'student.identity.corrected',
        targetId: target.accountId,
      },
    });
    expect(audit.before).toMatchObject({ displayName: '张三', gender: 'MALE' });
    expect(audit.after).toMatchObject({
      displayName: '张三丰',
      gender: 'FEMALE',
    });

    await expect(
      asOtherCounselor(() =>
        studentAdmin.correctStudentIdentity(target.accountId, {
          displayName: '改名',
        }),
      ),
    ).rejects.toThrow('Student within the current scope was not found');
    await expect(
      asCounselor(() =>
        studentAdmin.correctStudentIdentity(target.accountId, {}),
      ),
    ).rejects.toThrow(StudentIdentityCorrectionEmptyError);
  });

  async function seedTwoStudents(
    numberPrefix: string,
    phonePrefix: string,
  ): Promise<
    Array<{ accountId: string; studentNumber: string; phone: string }>
  > {
    await asCounselor(() =>
      studentImport.importClassStudents(classId, {
        csv:
          CSV_HEADER +
          [
            `张三,${numberPrefix}01,${phonePrefix}1,男`,
            `李四,${numberPrefix}02,${phonePrefix}2,女`,
          ].join('\n'),
      }),
    );
    const profiles = await prisma.studentProfile.findMany({
      where: {
        tenantId: universityTenantId,
        studentNumber: {
          in: [`${numberPrefix}01`, `${numberPrefix}02`],
        },
      },
      include: { account: true },
      orderBy: { studentNumber: 'asc' },
    });
    return profiles.map((profile) => ({
      accountId: profile.accountId,
      studentNumber: profile.studentNumber!,
      phone: profile.account.phone!,
    }));
  }

  async function seedUniversityTree(): Promise<void> {
    await prisma.tenant.create({
      data: {
        id: universityTenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试生命周期高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: universityAdminAccountId,
        kind: 'END_USER',
        phone: '13700137400',
        displayName: '校级管理员',
        status: 'ACTIVE',
        membership: {
          create: { tenantId: universityTenantId, role: 'UNIVERSITY_ADMIN' },
        },
      },
    });

    const shizuishan = await asUniversityAdmin(() =>
      universityOrganization.createCampus({
        name: '生命周期石嘴山校区',
        divisionCode: '640200',
      }),
    );
    const yinchuan = await asUniversityAdmin(() =>
      universityOrganization.createCampus({
        name: '生命周期银川校区',
        divisionCode: '640100',
      }),
    );
    const college = await asUniversityAdmin(() =>
      universityOrganization.createCollege({
        name: '生命周期学院',
        campusIds: [shizuishan.id, yinchuan.id],
      }),
    );
    collegeId = college.id;

    const collegeAdmin = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '生命周期院管',
        phone: '13700137402',
        role: 'COLLEGE_ADMIN',
        collegeId: college.id,
      }),
    );
    await prisma.account.update({
      where: { id: collegeAdmin.accountId },
      data: { status: 'ACTIVE' },
    });
    const programLead = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '生命周期专业负责人',
        phone: '13700137403',
        role: 'PROGRAM_LEAD',
        collegeId: college.id,
      }),
    );
    const counselor = await asCollegeAdminOf(collegeAdmin.accountId, () =>
      universityOrganization.createMember({
        displayName: '生命周期辅导员',
        phone: counselorPhone,
        role: 'COUNSELOR',
        collegeId: college.id,
      }),
    );
    const otherCounselor = await asCollegeAdminOf(collegeAdmin.accountId, () =>
      universityOrganization.createMember({
        displayName: '生命周期他班辅导员',
        phone: '13700137405',
        role: 'COUNSELOR',
        collegeId: college.id,
      }),
    );
    for (const member of [programLead, counselor, otherCounselor]) {
      await prisma.account.update({
        where: { id: member.accountId },
        data: { status: 'ACTIVE' },
      });
    }
    collegeAdminAccountId = collegeAdmin.accountId;
    programLeadAccountId = programLead.accountId;
    counselorAccountId = counselor.accountId;
    otherCounselorAccountId = otherCounselor.accountId;

    const major = await asCollegeAdminOf(collegeAdmin.accountId, () =>
      universityOrganization.createMajor({
        collegeId: college.id,
        name: '生命周期专业',
      }),
    );
    const cohort = await asCollegeAdminOf(collegeAdmin.accountId, () =>
      universityOrganization.createClass({
        majorId: major.id,
        name: '生命 2601',
        gradeLabel: '2026',
        counselorMembershipId: counselor.membershipId,
      }),
    );
    const otherCohort = await asCollegeAdminOf(collegeAdmin.accountId, () =>
      universityOrganization.createClass({
        majorId: major.id,
        name: '生命 2602',
        gradeLabel: '2026',
        counselorMembershipId: otherCounselor.membershipId,
      }),
    );
    classId = cohort.id;
    otherClassId = otherCohort.id;
  }

  function asUniversityAdmin<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'lifecycle-university-admin',
        actorAccountId: universityAdminAccountId,
        tenantId: universityTenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      callback,
    );
  }

  function asCollegeAdmin<T>(callback: () => T): T {
    return asCollegeAdminOf(collegeAdminAccountId, callback);
  }

  function asCollegeAdminOf<T>(accountId: string, callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'lifecycle-college-admin',
        actorAccountId: accountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      callback,
    );
  }

  function asProgramLead<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'lifecycle-program-lead',
        actorAccountId: programLeadAccountId,
        tenantId: universityTenantId,
        role: 'PROGRAM_LEAD',
      },
      callback,
    );
  }

  function asCounselor<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'lifecycle-counselor',
        actorAccountId: counselorAccountId,
        tenantId: universityTenantId,
        role: 'COUNSELOR',
      },
      callback,
    );
  }

  function asOtherCounselor<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'lifecycle-other-counselor',
        actorAccountId: otherCounselorAccountId,
        tenantId: universityTenantId,
        role: 'COUNSELOR',
      },
      callback,
    );
  }

  async function cleanFixturesStudents(): Promise<void> {
    const accounts = await prisma.membership.findMany({
      where: {
        tenantId: universityTenantId,
        role: 'STUDENT',
      },
      select: { accountId: true },
    });
    await prisma.auditEvent.deleteMany({
      where: { targetId: { in: accounts.map((item) => item.accountId) } },
    });
    await prisma.classTransferRequest.deleteMany({
      where: {
        studentAccountId: { in: accounts.map((item) => item.accountId) },
      },
    });
    await prisma.studentProfile.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.retiredStudentNumber.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.membership.deleteMany({
      where: { accountId: { in: accounts.map((item) => item.accountId) } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: accounts.map((item) => item.accountId) } },
    });
  }

  async function cleanFixturesTree(): Promise<void> {
    await prisma.auditEvent.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.staffPostHandover.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.cohortClass.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.major.deleteMany({ where: { tenantId: universityTenantId } });
    await prisma.collegeCampus.deleteMany({
      where: { tenantId: universityTenantId },
    });
    const staff = await prisma.membership.findMany({
      where: { tenantId: universityTenantId },
      select: { accountId: true },
    });
    await prisma.membership.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.college.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.campus.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [...staff, { accountId: universityAdminAccountId }].map((item) => item.accountId) } },
    });
    await prisma.university.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.tenant.deleteMany({
      where: { id: universityTenantId },
    });
  }
});
