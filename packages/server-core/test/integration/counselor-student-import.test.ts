import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import { CounselorStudentImportService } from '../../src/modules/organization/application/counselor-student-import.service';
import { UniversityOrganizationService } from '../../src/modules/organization/application/university-organization.service';

const prisma = new PrismaService();
const requestContext = new RequestContextService();
const universityOrganization = new UniversityOrganizationService(
  prisma,
  requestContext,
);
const studentImport = new CounselorStudentImportService(prisma, requestContext);

const universityTenantId = '10000000-0000-4000-8000-000000000301';
const publicAcademyTenantId = '10000000-0000-4000-8000-000000000302';
const enterpriseTenantId = '10000000-0000-4000-8000-000000000303';
const universityAdminAccountId = '20000000-0000-4000-8000-000000000301';

const counselorPhone = '13700137301';
const platformStudentPhone = '13700137302';
const enterpriseMemberPhone = '13700137303';

const CSV_HEADER = '姓名,学号,手机号,性别\n';

describe('Counselor student CSV import', () => {
  let classId = '';
  let counselorAccountId = '';
  let collegeAdminAccountId = '';
  let unassignedClassId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.administrativeDivision.upsert({
      where: { code: '640000' },
      create: {
        code: '640000',
        name: '宁夏回族自治区',
        level: 'PROVINCE',
        active: true,
      },
      update: {},
    });
    await prisma.administrativeDivision.upsert({
      where: { code: '640100' },
      create: {
        code: '640100',
        name: '银川市',
        level: 'PREFECTURE',
        parentCode: '640000',
        active: true,
      },
      update: {},
    });
    await seedOccupants();
  });

  afterEach(cleanFixtures);

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('辅导员在本人管辖班级内导入：合法行入库，失败行逐行回报并附占用主体指引', async () => {
    await seedUniversityTree();

    const csv =
      CSV_HEADER +
      [
        '张三,2026010101,13811111111,男',
        '李四,2026010102,1381111111,女',
        '王五,2026010103,13811111113,未说明',
        '赵六,2026010101,13811111114,男',
        `钱七,2026010104,${counselorPhone},女`,
        `孙八,2026010105,${platformStudentPhone},男`,
        `周九,2026010106,${enterpriseMemberPhone},女`,
      ].join('\n');

    const result = await asCounselor(() =>
      studentImport.importClassStudents(classId, { csv }),
    );

    expect(result.createdCount).toBe(1);
    expect(
      result.failures.map((failure) => [failure.row, failure.reason]),
    ).toEqual([
      [3, 'INVALID_PHONE'],
      [4, 'INVALID_GENDER'],
      [5, 'DUPLICATE_STUDENT_NUMBER_IN_FILE'],
      [6, 'PHONE_ALREADY_USED'],
      [7, 'PHONE_ALREADY_USED'],
      [8, 'PHONE_ALREADY_USED'],
    ]);

    const staffOccupation = result.failures.find(
      (failure) => failure.row === 6,
    )?.occupation;
    expect(staffOccupation).toMatchObject({
      subjectType: 'UNIVERSITY_STAFF',
      studentNumber: null,
    });

    const platformOccupation = result.failures.find(
      (failure) => failure.row === 7,
    )?.occupation;
    expect(platformOccupation).toMatchObject({
      subjectType: 'PLATFORM_STUDENT',
      guidance: '该号已注册为平台学员，请学生先自助注销后重导',
    });

    const enterpriseOccupation = result.failures.find(
      (failure) => failure.row === 8,
    )?.occupation;
    expect(enterpriseOccupation).toMatchObject({
      subjectType: 'ENTERPRISE_MEMBER',
    });

    const created = await prisma.account.findUniqueOrThrow({
      where: { phone: '13811111111' },
      include: { membership: true, studentProfile: true },
    });
    expect(created).toMatchObject({
      kind: 'END_USER',
      displayName: '张三',
      gender: 'MALE',
      status: 'PENDING_ACTIVATION',
    });
    expect(created.membership).toMatchObject({
      tenantId: universityTenantId,
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    expect(created.studentProfile).toMatchObject({
      tenantId: universityTenantId,
      kind: 'UNIVERSITY_CERTIFIED',
      studentNumber: '2026010101',
      lifecycleState: 'ENROLLED',
      classId,
    });

    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'university.students.imported',
          targetType: 'class',
          targetId: classId,
        },
      }),
    ).resolves.toMatchObject({ tenantId: universityTenantId });
  });

  it('同一学号或手机号二次导入按库内既有数据报冲突，不再重复创建', async () => {
    await seedUniversityTree();
    await asCounselor(() =>
      studentImport.importClassStudents(classId, {
        csv: `${CSV_HEADER}张三,2026010101,13811111111,男`,
      }),
    );

    const result = await asCounselor(() =>
      studentImport.importClassStudents(classId, {
        csv: `${CSV_HEADER}李四,2026010102,13811111111,女\n王五,2026010101,13811111115,男`,
      }),
    );

    expect(result.createdCount).toBe(0);
    expect(result.failures.map((failure) => failure.reason)).toEqual([
      'PHONE_ALREADY_USED',
      'STUDENT_NUMBER_ALREADY_USED',
    ]);
    expect(result.failures[0]?.occupation).toMatchObject({
      subjectType: 'UNIVERSITY_STUDENT_CURRENT_TENANT',
      tenantName: '知行工坊测试导入高校',
      studentNumber: '2026010101',
    });
  });

  it('非辅导员角色、非本人管辖班级与坏表头分别被拒绝', async () => {
    await seedUniversityTree();

    await expect(
      asCollegeAdmin(() =>
        studentImport.importClassStudents(classId, {
          csv: `${CSV_HEADER}张三,2026010101,13811111111,男`,
        }),
      ),
    ).rejects.toThrow('Only a counselor can import students into a managed class');

    await expect(
      asCounselor(() =>
        studentImport.importClassStudents(unassignedClassId, {
          csv: `${CSV_HEADER}张三,2026010101,13811111111,男`,
        }),
      ),
    ).rejects.toThrow('Class managed by the current counselor was not found');

    await expect(
      asCounselor(() =>
        studentImport.importClassStudents(classId, { csv: 'name,id\n' }),
      ),
    ).rejects.toThrow('Student CSV header must be exactly');
  });

  async function seedUniversityTree(): Promise<void> {
    await prisma.tenant.create({
      data: {
        id: universityTenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试导入高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: universityAdminAccountId,
        kind: 'END_USER',
        phone: '13700137300',
        displayName: '校级管理员',
        status: 'ACTIVE',
        membership: {
          create: { tenantId: universityTenantId, role: 'UNIVERSITY_ADMIN' },
        },
      },
    });

    const campus = await asUniversityAdmin(() =>
      universityOrganization.createCampus({
        name: '导入测试校区',
        divisionCode: '640100',
      }),
    );
    const college = await asUniversityAdmin(() =>
      universityOrganization.createCollege({
        name: '导入测试学院',
        campusIds: [campus.id],
      }),
    );
    const collegeAdmin = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '导入测试院管',
        phone: '13700137304',
        role: 'COLLEGE_ADMIN',
        collegeId: college.id,
      }),
    );
    await prisma.account.update({
      where: { id: collegeAdmin.accountId },
      data: { status: 'ACTIVE' },
    });
    collegeAdminAccountId = collegeAdmin.accountId;

    const counselor = await requestContext.run(
      {
        requestId: 'seed-counselor',
        actorAccountId: collegeAdmin.accountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      () =>
        universityOrganization.createMember({
          displayName: '导入测试辅导员',
          phone: counselorPhone,
          role: 'COUNSELOR',
          collegeId: college.id,
        }),
    );
    await prisma.account.update({
      where: { id: counselor.accountId },
      data: { status: 'ACTIVE' },
    });
    counselorAccountId = counselor.accountId;

    const major = await requestContext.run(
      {
        requestId: 'seed-major',
        actorAccountId: collegeAdmin.accountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      () =>
        universityOrganization.createMajor({
          collegeId: college.id,
          name: '导入测试专业',
        }),
    );
    const cohort = await requestContext.run(
      {
        requestId: 'seed-class',
        actorAccountId: collegeAdmin.accountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      () =>
        universityOrganization.createClass({
          majorId: major.id,
          name: '导入 2601',
          gradeLabel: '2026',
          counselorMembershipId: counselor.membershipId,
        }),
    );
    classId = cohort.id;
    const unassigned = await requestContext.run(
      {
        requestId: 'seed-unassigned-class',
        actorAccountId: collegeAdmin.accountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      () =>
        universityOrganization.createClass({
          majorId: major.id,
          name: '导入 2602',
          gradeLabel: '2026',
        }),
    );
    unassignedClassId = unassigned.id;
  }

  /** 手机号占用主体夹具：平台学员（知行公开学院）与企业成员 */
  async function seedOccupants(): Promise<void> {
    await prisma.enterpriseNatureTag.upsert({
      where: { code: 'import-test-general' },
      create: {
        code: 'import-test-general',
        name: '一般企业（导入测试）',
        sortOrder: 0,
      },
      update: {},
    });
    await prisma.industryCategory.upsert({
      where: { code: 'import-test-it' },
      create: {
        code: 'import-test-it',
        name: '信息技术（导入测试）',
      },
      update: {},
    });

    await prisma.tenant.create({
      data: {
        id: publicAcademyTenantId,
        type: 'UNIVERSITY',
        name: '知行公开学院（导入测试）',
        university: { create: { isPublicAcademy: true } },
      },
    });
    await prisma.account.create({
      data: {
        kind: 'END_USER',
        phone: platformStudentPhone,
        displayName: '占用平台学员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId: publicAcademyTenantId,
            role: 'STUDENT',
          },
        },
        studentProfile: {
          create: {
            tenantId: publicAcademyTenantId,
            kind: 'PLATFORM',
            registrationCityCode: '640100',
            residentCityCode: '640100',
          },
        },
      },
    });

    await prisma.tenant.create({
      data: {
        id: enterpriseTenantId,
        type: 'ENTERPRISE',
        name: '导入测试企业',
        enterprise: {
          create: {
            natureTagCode: 'import-test-general',
            industryCategoryCode: 'import-test-it',
          },
        },
      },
    });
    await prisma.account.create({
      data: {
        kind: 'END_USER',
        phone: enterpriseMemberPhone,
        displayName: '占用企业管理员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId: enterpriseTenantId,
            role: 'ENTERPRISE_ADMIN',
          },
        },
      },
    });
  }

  function asUniversityAdmin<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'university-admin-import',
        actorAccountId: universityAdminAccountId,
        tenantId: universityTenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      callback,
    );
  }

  function asCollegeAdmin<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'college-admin-import',
        actorAccountId: collegeAdminAccountId,
        tenantId: universityTenantId,
        role: 'COLLEGE_ADMIN',
      },
      callback,
    );
  }

  function asCounselor<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'counselor-import',
        actorAccountId: counselorAccountId,
        tenantId: universityTenantId,
        role: 'COUNSELOR',
      },
      callback,
    );
  }

  async function cleanFixtures(): Promise<void> {
    const fixtureTenantIds = [
      universityTenantId,
      publicAcademyTenantId,
      enterpriseTenantId,
    ];
    const fixtureMemberships = await prisma.membership.findMany({
      where: { tenantId: { in: fixtureTenantIds } },
      select: { accountId: true },
    });
    const fixtureAccountIds = [
      ...new Set(fixtureMemberships.map((membership) => membership.accountId)),
    ];

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { tenantId: { in: fixtureTenantIds } },
          { actorAccountId: { in: fixtureAccountIds } },
        ],
      },
    });
    await prisma.studentProfile.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.cohortClass.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.major.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.collegeCampus.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.membership.deleteMany({
      where: { accountId: { in: fixtureAccountIds } },
    });
    await prisma.college.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.campus.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: fixtureAccountIds } },
    });
    await prisma.enterprise.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.university.deleteMany({
      where: { tenantId: { in: fixtureTenantIds } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: fixtureTenantIds } },
    });
  }
});
