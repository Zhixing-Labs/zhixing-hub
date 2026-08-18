import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import { OrganizationAdminService } from '../../src/modules/organization/application/organization-admin.service';
import { OrganizationQueryService } from '../../src/modules/organization/application/organization-query.service';
import { UniversityOrganizationService } from '../../src/modules/organization/application/university-organization.service';

const prisma = new PrismaService();
const requestContext = new RequestContextService();
const organizationAdmin = new OrganizationAdminService(prisma, requestContext);
const organizationQuery = new OrganizationQueryService(prisma, requestContext);
const universityOrganization = new UniversityOrganizationService(
  prisma,
  requestContext,
);

const platformTenantId = '10000000-0000-4000-8000-000000000201';
const universityTenantId = '10000000-0000-4000-8000-000000000202';
const orgAdminAccountId = '20000000-0000-4000-8000-000000000201';
const universityAdminAccountId = '20000000-0000-4000-8000-000000000202';
const secondUniversityAdminPhone = '13700137011';

describe('University organization tree', () => {
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
    await prisma.administrativeDivision.upsert({
      where: { code: '640200' },
      create: {
        code: '640200',
        name: '石嘴山市',
        level: 'PREFECTURE',
        parentCode: '640000',
        active: true,
      },
      update: {},
    });
  });

  afterEach(cleanFixtures);

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('校级管理员可建组织树，院管可在本院开辅导员并挂班', async () => {
    await seedUniversity();

    const campus = await asUniversityAdmin(() =>
      universityOrganization.createCampus({
        name: '银川校区',
        divisionCode: '640100',
      }),
    );
    const college = await asUniversityAdmin(() =>
      universityOrganization.createCollege({
        name: '计算机学院',
        campusIds: [campus.id],
      }),
    );
    const collegeAdmin = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '测试院管',
        phone: '13700137012',
        role: 'COLLEGE_ADMIN',
        collegeId: college.id,
      }),
    );
    expect(collegeAdmin.accountStatus).toBe('PENDING_ACTIVATION');
    expect(collegeAdmin.collegeId).toBe(college.id);

    await prisma.account.update({
      where: { id: collegeAdmin.accountId },
      data: { status: 'ACTIVE' },
    });

    const major = await asCollegeAdmin(collegeAdmin.accountId, () =>
      universityOrganization.createMajor({
        collegeId: college.id,
        name: '软件工程',
      }),
    );
    const counselor = await asCollegeAdmin(collegeAdmin.accountId, () =>
      universityOrganization.createMember({
        displayName: '测试辅导员',
        phone: '13700137013',
        role: 'COUNSELOR',
        collegeId: college.id,
      }),
    );
    const cohort = await asCollegeAdmin(collegeAdmin.accountId, () =>
      universityOrganization.createClass({
        majorId: major.id,
        name: '软工 2601',
        gradeLabel: '2026',
        counselorMembershipId: counselor.membershipId,
      }),
    );
    expect(cohort.counselorMembershipId).toBe(counselor.membershipId);

    const tree = await asCollegeAdmin(collegeAdmin.accountId, () =>
      universityOrganization.getOrgTree(),
    );
    expect(tree.colleges).toHaveLength(1);
    expect(tree.colleges[0]?.majors[0]?.classes[0]?.name).toBe('软工 2601');
    expect(tree.members.map((member) => member.role).sort()).toEqual([
      'COLLEGE_ADMIN',
      'COUNSELOR',
    ]);

    await expect(
      asCollegeAdmin(collegeAdmin.accountId, () =>
        universityOrganization.createCampus({
          name: '石嘴山校区',
          divisionCode: '640200',
        }),
      ),
    ).rejects.toThrow('Current role cannot manage this university organization');
  });

  it('院管不能操作外院，班级辅导员必须是本院辅导员', async () => {
    await seedUniversity();
    const campus = await asUniversityAdmin(() =>
      universityOrganization.createCampus({
        name: '银川校区',
        divisionCode: '640100',
      }),
    );
    const firstCollege = await asUniversityAdmin(() =>
      universityOrganization.createCollege({
        name: '计算机学院',
        campusIds: [campus.id],
      }),
    );
    const secondCollege = await asUniversityAdmin(() =>
      universityOrganization.createCollege({
        name: '机械工程学院',
        campusIds: [campus.id],
      }),
    );
    const firstAdmin = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '计院院管',
        phone: '13700137014',
        role: 'COLLEGE_ADMIN',
        collegeId: firstCollege.id,
      }),
    );
    const counselor = await asUniversityAdmin(() =>
      universityOrganization.createMember({
        displayName: '计院辅导员',
        phone: '13700137015',
        role: 'COUNSELOR',
        collegeId: firstCollege.id,
      }),
    );
    await prisma.account.update({
      where: { id: firstAdmin.accountId },
      data: { status: 'ACTIVE' },
    });

    await expect(
      asCollegeAdmin(firstAdmin.accountId, () =>
        universityOrganization.createMajor({
          collegeId: secondCollege.id,
          name: '机械设计',
        }),
      ),
    ).rejects.toThrow('Current role cannot manage this university organization');

    const major = await asCollegeAdmin(firstAdmin.accountId, () =>
      universityOrganization.createMajor({
        collegeId: firstCollege.id,
        name: '软件工程',
      }),
    );
    await expect(
      asCollegeAdmin(firstAdmin.accountId, () =>
        universityOrganization.createClass({
          majorId: major.id,
          name: '非法挂班',
          gradeLabel: '2026',
          counselorMembershipId: firstAdmin.membershipId,
        }),
      ),
    ).rejects.toThrow(
      'A referenced division, dictionary item, or university does not exist',
    );

    const created = await asCollegeAdmin(firstAdmin.accountId, () =>
      universityOrganization.createClass({
        majorId: major.id,
        name: '软工 2601',
        gradeLabel: '2026',
      }),
    );
    await asCollegeAdmin(firstAdmin.accountId, () =>
      universityOrganization.assignClassCounselor(created.id, {
        counselorMembershipId: counselor.membershipId,
      }),
    );
  });

  it('组织管理员可向已有高校追加校级管理员，校区必须落在地级市', async () => {
    await seedUniversity();
    const added = await requestContext.run(
      {
        requestId: 'add-university-admin',
        actorAccountId: orgAdminAccountId,
        tenantId: platformTenantId,
        role: 'ORGANIZATION_ADMIN',
      },
      () =>
        organizationAdmin.addUniversityAdmin(universityTenantId, {
          displayName: '第二校管',
          phone: secondUniversityAdminPhone,
        }),
    );
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: added.accountId } }),
    ).resolves.toMatchObject({
      kind: 'END_USER',
      phone: secondUniversityAdminPhone,
      status: 'PENDING_ACTIVATION',
    });

    await expect(
      asUniversityAdmin(() =>
        universityOrganization.createCampus({
          name: '省级挂点',
          divisionCode: '640000',
        }),
      ),
    ).rejects.toThrow(
      'A referenced division, dictionary item, or university does not exist',
    );

    const divisions = await requestContext.run(
      {
        requestId: 'list-divisions',
        actorAccountId: universityAdminAccountId,
        tenantId: universityTenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      () => organizationQuery.listAdministrativeDivisions(),
    );
    expect(divisions.some((item) => item.code === '640100')).toBe(true);
  });
});

async function seedUniversity(): Promise<void> {
  await prisma.tenant.create({
    data: {
      id: platformTenantId,
      type: 'PLATFORM',
      name: '知行工坊测试高校组织平台',
    },
  });
  await prisma.account.create({
    data: {
      id: orgAdminAccountId,
      kind: 'PLATFORM_ADMIN',
      username: 'org-admin-university-tree',
      phone: null,
      displayName: '组织管理员',
      status: 'ACTIVE',
      membership: {
        create: {
          tenantId: platformTenantId,
          role: 'ORGANIZATION_ADMIN',
        },
      },
    },
  });
  await prisma.tenant.create({
    data: {
      id: universityTenantId,
      type: 'UNIVERSITY',
      name: '知行工坊测试高校组织',
      university: { create: {} },
    },
  });
  await prisma.account.create({
    data: {
      id: universityAdminAccountId,
      kind: 'END_USER',
      phone: '13700137010',
      displayName: '校级管理员',
      status: 'ACTIVE',
      membership: {
        create: {
          tenantId: universityTenantId,
          role: 'UNIVERSITY_ADMIN',
        },
      },
    },
  });
}

function asUniversityAdmin<T>(callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'university-admin',
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
      requestId: 'college-admin',
      actorAccountId: accountId,
      tenantId: universityTenantId,
      role: 'COLLEGE_ADMIN',
    },
    callback,
  );
}

async function cleanFixtures(): Promise<void> {
  const fixtureTenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { id: { in: [platformTenantId, universityTenantId] } },
        { name: { startsWith: '知行工坊测试高校组织' } },
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
      orgAdminAccountId,
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
