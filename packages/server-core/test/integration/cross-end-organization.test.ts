import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import { InvalidCaptchaError } from '../../src/modules/identity/application/activation-code.service';
import { EnterpriseOrganizationService } from '../../src/modules/organization/application/enterprise-organization.service';
import { GovernmentOrganizationService } from '../../src/modules/organization/application/government-organization.service';
import { OnboardingLeadService } from '../../src/modules/organization/application/onboarding-lead.service';
import { OrganizationAdminService } from '../../src/modules/organization/application/organization-admin.service';
import { OrganizationQueryService } from '../../src/modules/organization/application/organization-query.service';
import {
  PublicAcademyCampusOccupiedError,
  PublicAcademyAdminService,
} from '../../src/modules/organization/application/public-academy-admin.service';
import { MockCaptchaAdapter } from '../../src/modules/integration/mock-integration.adapters';

const prisma = new PrismaService();
const requestContext = new RequestContextService();
const organizationAdmin = new OrganizationAdminService(prisma, requestContext);
const organizationQuery = new OrganizationQueryService(prisma, requestContext);
const onboardingLeads = new OnboardingLeadService(
  prisma,
  requestContext,
  new MockCaptchaAdapter(),
);
const enterpriseOrganization = new EnterpriseOrganizationService(
  prisma,
  requestContext,
);
const governmentOrganization = new GovernmentOrganizationService(
  prisma,
  requestContext,
);
const publicAcademy = new PublicAcademyAdminService(prisma, requestContext);

const platformTenantId = '10000000-0000-4000-8000-000000000701';
const orgAdminAccountId = '20000000-0000-4000-8000-000000000701';
const opsAccountId = '20000000-0000-4000-8000-000000000702';
const MOCK_CAPTCHA = 'zhixing-mock-captcha-passed';
const LEAD_NAME_PREFIX = '跨端线索';

describe('Cross-end organization', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const [code, name, parent] of [
      ['640000', '宁夏回族自治区', null],
      ['640100', '银川市', '640000'],
      ['640400', '固原市', '640000'],
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

  it('组织管理员可列字典与租户、追加企业/政务管理员并替换可见高校', async () => {
    await seedPlatform();
    const university = await asOrgAdmin(() =>
      organizationAdmin.createUniversity({
        name: '跨端测试高校',
        initialAdmin: { displayName: '校管', phone: '13700137710' },
      }),
    );
    const enterprise = await asOrgAdmin(() =>
      organizationAdmin.createEnterprise({
        name: '跨端测试企业',
        natureTagCode: 'GENERAL',
        industryCategoryCode: 'I',
        locationCodes: ['640100'],
        initialAdmin: { displayName: '企管', phone: '13700137711' },
      }),
    );
    const government = await asOrgAdmin(() =>
      organizationAdmin.createGovernment({
        name: '跨端测试机关',
        divisionCode: '640100',
        visibleUniversityTenantIds: [university.tenantId],
        initialAdmin: { displayName: '政管', phone: '13700137712' },
      }),
    );

    await asOrgAdmin(() =>
      organizationAdmin.addEnterpriseAdmin(enterprise.tenantId, {
        displayName: '第二企管',
        phone: '13700137713',
      }),
    );
    await asOrgAdmin(() =>
      organizationAdmin.addGovernmentAdmin(government.tenantId, {
        displayName: '第二政管',
        phone: '13700137714',
      }),
    );
    await asOrgAdmin(() =>
      organizationAdmin.replaceGovernmentUniversityScopes(government.tenantId, []),
    );
    expect(
      await prisma.governmentUniversityScope.count({
        where: { governmentTenantId: government.tenantId },
      }),
    ).toBe(0);

    const tenants = await asOrgAdmin(() => organizationAdmin.listTenants());
    expect(tenants.map((item) => item.name)).toEqual(
      expect.arrayContaining(['跨端测试高校', '跨端测试企业', '跨端测试机关']),
    );
    const tags = await asOrgAdmin(() =>
      organizationQuery.listEnterpriseNatureTags(),
    );
    expect(tags.some((item) => item.code === 'GENERAL')).toBe(true);
  });

  it('入驻线索须过验证码；组织管理员只改状态', async () => {
    await seedPlatform();
    await expect(
      onboardingLeads.submit({
        kind: 'UNIVERSITY',
        institutionName: `${LEAD_NAME_PREFIX}高校`,
        contactName: '张老师',
        contactMethod: '13700137720',
        intent: '希望开通高校租户',
        captchaToken: 'invalid',
      }),
    ).rejects.toThrow(InvalidCaptchaError);

    const created = await onboardingLeads.submit({
      kind: 'UNIVERSITY',
      institutionName: `${LEAD_NAME_PREFIX}高校`,
      contactName: '张老师',
      contactMethod: '13700137720',
      intent: '希望开通高校租户',
      captchaToken: MOCK_CAPTCHA,
    });
    expect(created.status).toBe('NEW');
    const listed = await asOrgAdmin(() => onboardingLeads.list());
    expect(listed.map((item) => item.id)).toContain(created.id);
    const updated = await asOrgAdmin(() =>
      onboardingLeads.updateStatus(created.id, 'IN_PROGRESS'),
    );
    expect(updated.status).toBe('IN_PROGRESS');
  });

  it('企业管理员可建部门与成员、改所在地；不可停企业管理员', async () => {
    await seedPlatform();
    const created = await asOrgAdmin(() =>
      organizationAdmin.createEnterprise({
        name: '跨端测试企业组织',
        natureTagCode: 'GENERAL',
        industryCategoryCode: 'I',
        locationCodes: ['640100'],
        initialAdmin: { displayName: '企管', phone: '13700137730' },
      }),
    );
    await prisma.account.update({
      where: { id: created.initialAdminAccountId },
      data: { status: 'ACTIVE' },
    });
    const adminMembership = await prisma.membership.findUniqueOrThrow({
      where: { accountId: created.initialAdminAccountId },
    });

    const department = await asEnterpriseAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () => enterpriseOrganization.createDepartment({ name: '人力资源部' }),
    );
    const hr = await asEnterpriseAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () =>
        enterpriseOrganization.createMember({
          displayName: 'HR 甲',
          phone: '13700137731',
          role: 'HR',
          departmentId: department.id,
        }),
    );
    await asEnterpriseAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () => enterpriseOrganization.replaceLocations(['640100', '640400']),
    );
    const org = await asEnterpriseAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () => enterpriseOrganization.getOrg(),
    );
    expect(org.departments).toHaveLength(1);
    expect(org.locations).toHaveLength(2);
    expect(org.members.map((member) => member.role)).toEqual(
      expect.arrayContaining(['ENTERPRISE_ADMIN', 'HR']),
    );

    await expect(
      asEnterpriseAdmin(
        created.initialAdminAccountId,
        created.tenantId,
        () => enterpriseOrganization.disableMember(adminMembership.id),
      ),
    ).rejects.toThrow('Enterprise organization record was not found');
    await asEnterpriseAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () => enterpriseOrganization.disableMember(hr.membershipId),
    );
  });

  it('政务管理员可创建并停用不带管理权限的看板账户，不可停自己', async () => {
    await seedPlatform();
    const created = await asOrgAdmin(() =>
      organizationAdmin.createGovernment({
        name: '跨端测试机关组织',
        divisionCode: '640100',
        visibleUniversityTenantIds: [],
        initialAdmin: { displayName: '政管', phone: '13700137740' },
      }),
    );
    await prisma.account.update({
      where: { id: created.initialAdminAccountId },
      data: { status: 'ACTIVE' },
    });
    const adminMembership = await prisma.membership.findUniqueOrThrow({
      where: { accountId: created.initialAdminAccountId },
    });
    const viewer = await asGovernmentAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () =>
        governmentOrganization.createMember({
          displayName: '看板',
          phone: '13700137741',
        }),
    );
    await expect(
      asGovernmentAdmin(
        created.initialAdminAccountId,
        created.tenantId,
        () => governmentOrganization.disableMember(adminMembership.id),
      ),
    ).rejects.toThrow('Government organization record was not found');
    await asGovernmentAdmin(
      created.initialAdminAccountId,
      created.tenantId,
      () => governmentOrganization.disableMember(viewer.membershipId),
    );
  });

  it('公开学院无学员校区可停用；有注册学员的市拒绝停用', async () => {
    await seedPlatform();
    const academy = await prisma.university.findFirst({
      where: { isPublicAcademy: true },
      include: { tenant: { include: { campuses: true } } },
    });
    if (!academy || academy.tenant.campuses.length === 0) {
      return;
    }

    const emptyCampus =
      academy.tenant.campuses.find((campus) => campus.divisionCode === '640400') ??
      academy.tenant.campuses[0]!;
    const occupiedCampus =
      academy.tenant.campuses.find((campus) => campus.divisionCode === '640100') ??
      emptyCampus;

    await asOps(() => publicAcademy.setCampusStatus(emptyCampus.id, 'DISABLED'));
    try {
      await expect(
        prisma.campus.findUniqueOrThrow({ where: { id: emptyCampus.id } }),
      ).resolves.toMatchObject({ status: 'DISABLED' });
    } finally {
      await asOps(() => publicAcademy.setCampusStatus(emptyCampus.id, 'ACTIVE'));
    }

    if (occupiedCampus.id === emptyCampus.id) {
      return;
    }
    const student = await prisma.account.create({
      data: {
        kind: 'END_USER',
        phone: '13700137750',
        displayName: '公开学院测试生',
        status: 'ACTIVE',
        membership: {
          create: { tenantId: academy.tenantId, role: 'STUDENT' },
        },
        studentProfile: {
          create: {
            tenantId: academy.tenantId,
            kind: 'PLATFORM',
            registrationCityCode: occupiedCampus.divisionCode,
            residentCityCode: occupiedCampus.divisionCode,
          },
        },
      },
    });
    await expect(
      asOps(() => publicAcademy.setCampusStatus(occupiedCampus.id, 'DISABLED')),
    ).rejects.toThrow(PublicAcademyCampusOccupiedError);
    await prisma.studentProfile.delete({ where: { accountId: student.id } });
    await prisma.membership.delete({ where: { accountId: student.id } });
    await prisma.account.delete({ where: { id: student.id } });
  });
});

async function seedPlatform(): Promise<void> {
  await prisma.tenant.create({
    data: {
      id: platformTenantId,
      type: 'PLATFORM',
      name: '知行工坊测试跨端组织平台',
    },
  });
  await prisma.account.create({
    data: {
      id: orgAdminAccountId,
      kind: 'PLATFORM_ADMIN',
      username: 'org-admin-cross-end',
      phone: null,
      displayName: '组织管理员',
      status: 'ACTIVE',
      membership: {
        create: { tenantId: platformTenantId, role: 'ORGANIZATION_ADMIN' },
      },
    },
  });
  await prisma.account.create({
    data: {
      id: opsAccountId,
      kind: 'PLATFORM_ADMIN',
      username: 'ops-cross-end',
      phone: null,
      displayName: '运营专员',
      status: 'ACTIVE',
      membership: {
        create: {
          tenantId: platformTenantId,
          role: 'OPERATIONS_SPECIALIST',
        },
      },
    },
  });
}

function asOrgAdmin<T>(callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'cross-org-admin',
      actorAccountId: orgAdminAccountId,
      tenantId: platformTenantId,
      role: 'ORGANIZATION_ADMIN',
    },
    callback,
  );
}

function asOps<T>(callback: () => T): T {
  return requestContext.run(
    {
      requestId: 'cross-ops',
      actorAccountId: opsAccountId,
      tenantId: platformTenantId,
      role: 'OPERATIONS_SPECIALIST',
    },
    callback,
  );
}

function asEnterpriseAdmin<T>(
  accountId: string,
  tenantId: string,
  callback: () => T,
): T {
  return requestContext.run(
    {
      requestId: 'cross-enterprise-admin',
      actorAccountId: accountId,
      tenantId,
      role: 'ENTERPRISE_ADMIN',
    },
    callback,
  );
}

function asGovernmentAdmin<T>(
  accountId: string,
  tenantId: string,
  callback: () => T,
): T {
  return requestContext.run(
    {
      requestId: 'cross-government-admin',
      actorAccountId: accountId,
      tenantId,
      role: 'GOVERNMENT_DASHBOARD_ADMIN',
    },
    callback,
  );
}

async function cleanFixtures(): Promise<void> {
  await prisma.onboardingLead.deleteMany({
    where: { institutionName: { startsWith: LEAD_NAME_PREFIX } },
  });
  const fixtureTenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { id: platformTenantId },
        { name: { startsWith: '跨端测试' } },
        { name: { startsWith: '知行工坊测试跨端' } },
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
      opsAccountId,
      ...fixtureMemberships.map((membership) => membership.accountId),
    ]),
  ];

  const strayStudents = await prisma.account.findMany({
    where: { phone: '13700137750' },
    select: { id: true },
  });
  const strayIds = strayStudents.map((item) => item.id);

  await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { tenantId: { in: fixtureTenantIds } },
        { actorAccountId: { in: [...fixtureAccountIds, ...strayIds] } },
        { action: { startsWith: 'onboarding_lead.' } },
      ],
    },
  });
  await prisma.studentProfile.deleteMany({
    where: { accountId: { in: strayIds } },
  });
  await prisma.membership.deleteMany({
    where: { accountId: { in: strayIds } },
  });
  await prisma.account.deleteMany({ where: { id: { in: strayIds } } });
  await prisma.governmentUniversityScope.deleteMany({
    where: { governmentTenantId: { in: fixtureTenantIds } },
  });
  await prisma.enterpriseLocation.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.enterprise.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.governmentOffice.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.university.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.membership.deleteMany({
    where: { accountId: { in: fixtureAccountIds } },
  });
  await prisma.department.deleteMany({
    where: { tenantId: { in: fixtureTenantIds } },
  });
  await prisma.account.deleteMany({
    where: { id: { in: fixtureAccountIds } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: fixtureTenantIds } },
  });
}
