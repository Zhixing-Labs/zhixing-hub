import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import {
  ClassTransferConflictError,
  ClassTransferDeniedError,
  ClassTransferInvalidError,
  ClassTransferService,
} from '../../src/modules/organization/application/class-transfer.service';
import { StudentAdminService } from '../../src/modules/organization/application/student-admin.service';
import {
  UniversityOrganizationDeniedError,
  UniversityOrganizationService,
} from '../../src/modules/organization/application/university-organization.service';
import {
  StaffHandoverRequiredError,
  UniversityStaffService,
} from '../../src/modules/organization/application/university-staff.service';

const prisma = new PrismaService();
const requestContext = new RequestContextService();
const universityOrganization = new UniversityOrganizationService(
  prisma,
  requestContext,
);
const staff = new UniversityStaffService(prisma, requestContext);
const classTransfers = new ClassTransferService(prisma, requestContext);
const studentAdmin = new StudentAdminService(prisma, requestContext);

const universityTenantId = '10000000-0000-4000-8000-000000000601';
const universityAdminAccountId = '20000000-0000-4000-8000-000000000601';

describe('Staff handover, disable, and class transfer', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const [code, name, parent] of [
      ['640000', '宁夏回族自治区', null],
      ['640100', '银川市', '640000'],
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
  });

  afterEach(cleanFixtures);

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('辅导员有班时不可停用；移交全部班级后可停用并撤销会话', async () => {
    const tree = await seedTree();
    await prisma.authSession.create({
      data: {
        accountId: tree.counselorA.accountId,
        tokenHash: 'a'.repeat(64),
        csrfTokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(
      asUniversityAdmin(() => staff.disable(tree.counselorA.membershipId)),
    ).rejects.toThrow(StaffHandoverRequiredError);

    const handed = await asCollegeAdmin(tree.collegeAdmin.accountId, () =>
      staff.handover(tree.counselorA.membershipId, {
        successorMembershipId: tree.counselorB.membershipId,
      }),
    );
    expect(handed.reassignedClassCount).toBe(1);
    await expect(
      prisma.cohortClass.findUniqueOrThrow({ where: { id: tree.classA1Id } }),
    ).resolves.toMatchObject({
      counselorMembershipId: tree.counselorB.membershipId,
    });

    await asUniversityAdmin(() => staff.disable(tree.counselorA.membershipId));
    await expect(
      prisma.account.findUniqueOrThrow({
        where: { id: tree.counselorA.accountId },
      }),
    ).resolves.toMatchObject({ status: 'SUSPENDED' });
    await expect(
      prisma.membership.findUniqueOrThrow({
        where: { id: tree.counselorA.membershipId },
      }),
    ).resolves.toMatchObject({ status: 'DISABLED' });
    const session = await prisma.authSession.findFirstOrThrow({
      where: { accountId: tree.counselorA.accountId },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  it('无管辖班级的辅导员可直接停用；专业负责人须先点名继任', async () => {
    const tree = await seedTree();

    await asUniversityAdmin(() =>
      staff.disable(tree.idleCounselor.membershipId),
    );

    await expect(
      asUniversityAdmin(() => staff.disable(tree.programLeadA.membershipId)),
    ).rejects.toThrow(StaffHandoverRequiredError);

    await asCollegeAdmin(tree.collegeAdmin.accountId, () =>
      staff.handover(tree.programLeadA.membershipId, {
        successorMembershipId: tree.programLeadB.membershipId,
      }),
    );
    await asUniversityAdmin(() => staff.disable(tree.programLeadA.membershipId));
  });

  it('停用权限与开户矩阵一致：不可停自己或校管，院管不可动外院', async () => {
    const tree = await seedTree();

    await expect(
      asUniversityAdmin(() => staff.disable(tree.universityAdminMembershipId)),
    ).rejects.toThrow('University organization record was not found');

    await expect(
      asCollegeAdmin(tree.collegeAdmin.accountId, () =>
        staff.disable(tree.collegeAdmin.membershipId),
      ),
    ).rejects.toThrow(UniversityOrganizationDeniedError);

    await expect(
      asCollegeAdmin(tree.collegeAdmin.accountId, () =>
        staff.disable(tree.counselorC.membershipId),
      ),
    ).rejects.toThrow(UniversityOrganizationDeniedError);

    await asUniversityAdmin(() =>
      staff.disable(tree.collegeAdmin.membershipId),
    );
    await asUniversityAdmin(() => staff.disable(tree.dashboard.membershipId));
  });

  it('学生转班两步同意后改班；同辅导员一次同意即生效；跨院与重复申请拒绝', async () => {
    const tree = await seedTree();
    const student = await seedActiveStudent(
      tree.counselorA.accountId,
      tree.classA1Id,
      '2026060101',
      '13822220601',
    );

    await expect(
      asStudent(student.accountId, () =>
        classTransfers.create({ targetClassId: tree.classB1Id }),
      ),
    ).rejects.toThrow(ClassTransferInvalidError);

    const requested = await asStudent(student.accountId, () =>
      classTransfers.create({ targetClassId: tree.classA2Id }),
    );
    expect(requested.status).toBe('PENDING_OUTGOING');

    await expect(
      asStudent(student.accountId, () =>
        classTransfers.create({ targetClassId: tree.classA2Id }),
      ),
    ).rejects.toThrow(ClassTransferConflictError);

    await expect(
      asCounselor(tree.counselorB.accountId, () =>
        classTransfers.resolve(requested.id, { approve: true }),
      ),
    ).rejects.toThrow(ClassTransferDeniedError);

    const outgoing = await asCounselor(tree.counselorA.accountId, () =>
      classTransfers.resolve(requested.id, { approve: true }),
    );
    expect(outgoing.status).toBe('PENDING_INCOMING');

    const incomingQueue = await asCounselor(tree.counselorB.accountId, () =>
      classTransfers.listPendingForCounselor(),
    );
    expect(incomingQueue.map((item) => item.id)).toContain(requested.id);

    const approved = await asCounselor(tree.counselorB.accountId, () =>
      classTransfers.resolve(requested.id, { approve: true }),
    );
    expect(approved.status).toBe('APPROVED');
    await expect(
      prisma.studentProfile.findUniqueOrThrow({
        where: { accountId: student.accountId },
      }),
    ).resolves.toMatchObject({ classId: tree.classA2Id });

    const sameCounselorStudent = await seedActiveStudent(
      tree.counselorB.accountId,
      tree.classA2Id,
      '2026060102',
      '13822220602',
    );
    const sameCounselorClass = await asCollegeAdmin(
      tree.collegeAdmin.accountId,
      () =>
        universityOrganization.createClass({
          majorId: tree.majorAId,
          name: '移交 2603',
          gradeLabel: '2026',
          counselorMembershipId: tree.counselorB.membershipId,
        }),
    );
    const auto = await asStudent(sameCounselorStudent.accountId, () =>
      classTransfers.create({ targetClassId: sameCounselorClass.id }),
    );
    const autoApproved = await asCounselor(tree.counselorB.accountId, () =>
      classTransfers.resolve(auto.id, { approve: true }),
    );
    expect(autoApproved.status).toBe('APPROVED');
  });

  it('转出拒绝即结案；岗位移交后由新辅导员继续批', async () => {
    const tree = await seedTree();
    const rejectedStudent = await seedActiveStudent(
      tree.counselorA.accountId,
      tree.classA1Id,
      '2026060103',
      '13822220603',
    );
    const rejected = await asStudent(rejectedStudent.accountId, () =>
      classTransfers.create({ targetClassId: tree.classA2Id }),
    );
    const closed = await asCounselor(tree.counselorA.accountId, () =>
      classTransfers.resolve(rejected.id, { approve: false }),
    );
    expect(closed.status).toBe('REJECTED');

    const pendingStudent = await seedActiveStudent(
      tree.counselorA.accountId,
      tree.classA1Id,
      '2026060104',
      '13822220604',
    );
    const pending = await asStudent(pendingStudent.accountId, () =>
      classTransfers.create({ targetClassId: tree.classA2Id }),
    );
    await asCollegeAdmin(tree.collegeAdmin.accountId, () =>
      staff.handover(tree.counselorA.membershipId, {
        successorMembershipId: tree.counselorB.membershipId,
      }),
    );
    await expect(
      asCounselor(tree.counselorA.accountId, () =>
        classTransfers.resolve(pending.id, { approve: true }),
      ),
    ).rejects.toThrow(ClassTransferDeniedError);
    const continued = await asCounselor(tree.counselorB.accountId, () =>
      classTransfers.resolve(pending.id, { approve: true }),
    );
    expect(continued.status).toBe('APPROVED');
  });
});

async function seedTree() {
  await prisma.tenant.create({
    data: {
      id: universityTenantId,
      type: 'UNIVERSITY',
      name: '知行工坊测试岗位移交高校',
      university: { create: {} },
    },
  });
  const universityAdmin = await prisma.account.create({
    data: {
      id: universityAdminAccountId,
      kind: 'END_USER',
      phone: '13700137610',
      displayName: '校管',
      status: 'ACTIVE',
      membership: {
        create: { tenantId: universityTenantId, role: 'UNIVERSITY_ADMIN' },
      },
    },
    include: { membership: true },
  });

  const campus = await asUniversityAdmin(() =>
    universityOrganization.createCampus({
      name: '银川校区',
      divisionCode: '640100',
    }),
  );
  const collegeA = await asUniversityAdmin(() =>
    universityOrganization.createCollege({
      name: '计算机学院',
      campusIds: [campus.id],
    }),
  );
  const collegeB = await asUniversityAdmin(() =>
    universityOrganization.createCollege({
      name: '机械工程学院',
      campusIds: [campus.id],
    }),
  );

  const collegeAdmin = await createActiveStaff({
    displayName: '院管',
    phone: '13700137611',
    role: 'COLLEGE_ADMIN',
    collegeId: collegeA.id,
  });
  const counselorA = await createActiveStaff({
    displayName: '辅导员甲',
    phone: '13700137612',
    role: 'COUNSELOR',
    collegeId: collegeA.id,
  });
  const counselorB = await createActiveStaff({
    displayName: '辅导员乙',
    phone: '13700137613',
    role: 'COUNSELOR',
    collegeId: collegeA.id,
  });
  const idleCounselor = await createActiveStaff({
    displayName: '空闲辅导员',
    phone: '13700137614',
    role: 'COUNSELOR',
    collegeId: collegeA.id,
  });
  const counselorC = await createActiveStaff({
    displayName: '机械辅导员',
    phone: '13700137615',
    role: 'COUNSELOR',
    collegeId: collegeB.id,
  });
  const programLeadA = await createActiveStaff({
    displayName: '专业负责人甲',
    phone: '13700137616',
    role: 'PROGRAM_LEAD',
    collegeId: collegeA.id,
  });
  const programLeadB = await createActiveStaff({
    displayName: '专业负责人乙',
    phone: '13700137617',
    role: 'PROGRAM_LEAD',
    collegeId: collegeA.id,
  });
  const dashboard = await createActiveStaff({
    displayName: '校级看板',
    phone: '13700137618',
    role: 'UNIVERSITY_DASHBOARD',
  });

  const majorA = await asCollegeAdmin(collegeAdmin.accountId, () =>
    universityOrganization.createMajor({
      collegeId: collegeA.id,
      name: '软件工程',
    }),
  );
  const majorB = await asUniversityAdmin(() =>
    universityOrganization.createMajor({
      collegeId: collegeB.id,
      name: '机械设计',
    }),
  );
  const classA1 = await asCollegeAdmin(collegeAdmin.accountId, () =>
    universityOrganization.createClass({
      majorId: majorA.id,
      name: '软工 2601',
      gradeLabel: '2026',
      counselorMembershipId: counselorA.membershipId,
    }),
  );
  const classA2 = await asCollegeAdmin(collegeAdmin.accountId, () =>
    universityOrganization.createClass({
      majorId: majorA.id,
      name: '软工 2602',
      gradeLabel: '2026',
      counselorMembershipId: counselorB.membershipId,
    }),
  );
  const classB1 = await asUniversityAdmin(() =>
    universityOrganization.createClass({
      majorId: majorB.id,
      name: '机械 2601',
      gradeLabel: '2026',
      counselorMembershipId: counselorC.membershipId,
    }),
  );

  return {
    universityAdminMembershipId: universityAdmin.membership!.id,
    collegeAdmin,
    counselorA,
    counselorB,
    idleCounselor,
    counselorC,
    programLeadA,
    programLeadB,
    dashboard,
    majorAId: majorA.id,
    classA1Id: classA1.id,
    classA2Id: classA2.id,
    classB1Id: classB1.id,
  };
}

async function createActiveStaff(input: {
  displayName: string;
  phone: string;
  role: 'UNIVERSITY_DASHBOARD' | 'COLLEGE_ADMIN' | 'PROGRAM_LEAD' | 'COUNSELOR';
  collegeId?: string;
}) {
  const created = await asUniversityAdmin(() =>
    universityOrganization.createMember(input),
  );
  await prisma.account.update({
    where: { id: created.accountId },
    data: { status: 'ACTIVE' },
  });
  return created;
}

async function seedActiveStudent(
  counselorAccountId: string,
  classId: string,
  studentNumber: string,
  phone: string,
) {
  const created = await asCounselor(counselorAccountId, () =>
    studentAdmin.createStudent(classId, {
      name: `学生${studentNumber.slice(-2)}`,
      studentNumber,
      phone,
      gender: 'MALE',
    }),
  );
  await prisma.account.update({
    where: { id: created.accountId },
    data: { status: 'ACTIVE' },
  });
  return created;
}

function asUniversityAdmin<T>(callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'staff-university-admin',
      actorAccountId: universityAdminAccountId,
      tenantId: universityTenantId,
      role: 'UNIVERSITY_ADMIN',
    },
    callback,
  );
}

function asCollegeAdmin<T>(accountId: string, callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'staff-college-admin',
      actorAccountId: accountId,
      tenantId: universityTenantId,
      role: 'COLLEGE_ADMIN',
    },
    callback,
  );
}

function asCounselor<T>(accountId: string, callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'staff-counselor',
      actorAccountId: accountId,
      tenantId: universityTenantId,
      role: 'COUNSELOR',
    },
    callback,
  );
}

function asStudent<T>(accountId: string, callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'staff-student',
      actorAccountId: accountId,
      tenantId: universityTenantId,
      role: 'STUDENT',
    },
    callback,
  );
}

async function cleanFixtures(): Promise<void> {
  const fixtureTenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { id: universityTenantId },
        { name: { startsWith: '知行工坊测试岗位移交' } },
      ],
    },
    select: { id: true },
  });
  const fixtureTenantIds = fixtureTenants.map((tenant) => tenant.id);
  const fixtureMemberships = await prisma.membership.findMany({
    where: { tenantId: { in: fixtureTenantIds } },
    select: { accountId: true },
  });
  const fixtureAccountIds = [
    ...new Set([
      universityAdminAccountId,
      ...fixtureMemberships.map((membership) => membership.accountId),
    ]),
  ];

  await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { tenantId: { in: fixtureTenantIds } },
        { actorAccountId: { in: fixtureAccountIds } },
      ],
    },
  });
  await prisma.classTransferRequest.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.staffPostHandover.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.authSession.deleteMany({
    where: { accountId: { in: fixtureAccountIds } },
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
  await prisma.university.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: fixtureTenantIds } },
  });
}
