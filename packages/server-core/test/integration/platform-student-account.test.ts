import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import { ActivationCodeService } from '../../src/modules/identity/application/activation-code.service';
import { IdentityService } from '../../src/modules/identity/application/identity.service';
import { LoginThrottleService } from '../../src/modules/identity/application/login-throttle.service';
import {
  PhoneChangeInvalidError,
  PhoneChangeTargetOccupiedError,
  PhoneChangeService,
} from '../../src/modules/identity/application/phone-change.service';
import {
  InvalidRegistrationError,
  PlatformStudentRegistrationService,
  PublicAcademyNotConfiguredError,
  RegistrationCityUnavailableError,
  RegistrationPhoneOccupiedError,
} from '../../src/modules/identity/application/platform-student-registration.service';
import { ProtocolConsentService } from '../../src/modules/identity/application/protocol-consent.service';
import {
  ProfileCompletionConflictError,
  ProfileFrozenError,
  SelfEditRateLimitedError,
  StudentProfileService,
} from '../../src/modules/identity/application/student-profile.service';
import { PasswordHasher } from '../../src/modules/identity/domain/password-hasher';
import { TotpCipher } from '../../src/modules/identity/domain/totp-cipher';
import { TotpService } from '../../src/modules/identity/domain/totp.service';
import {
  MockCaptchaAdapter,
  MockSmsAdapter,
} from '../../src/modules/integration/mock-integration.adapters';

const prisma = new PrismaService();
const redis = new RedisService();
const requestContext = new RequestContextService();
const passwordHasher = new PasswordHasher();
const totp = new TotpService();
const totpCipher = new TotpCipher();
const loginThrottle = new LoginThrottleService(prisma);
const protocolConsents = new ProtocolConsentService(prisma);
const activationCodes = new ActivationCodeService(
  redis,
  new MockCaptchaAdapter(),
  new MockSmsAdapter(),
);
const identity = new IdentityService(
  prisma,
  passwordHasher,
  totpCipher,
  totp,
  loginThrottle,
  protocolConsents,
);
const registration = new PlatformStudentRegistrationService(
  prisma,
  requestContext,
  activationCodes,
  protocolConsents,
  identity,
);
const profile = new StudentProfileService(prisma, requestContext);
const phoneChange = new PhoneChangeService(
  prisma,
  requestContext,
  redis,
  activationCodes,
);

const CAPTCHA = 'zhixing-mock-captcha-passed';
const academyTenantId = '10000000-0000-4000-8000-000000000501';
const universityTenantId = '10000000-0000-4000-8000-000000000502';
const universityStudentAccountId = '20000000-0000-4000-8000-000000000501';
const staffAccountId = '20000000-0000-4000-8000-000000000502';
const staffBAccountId = '20000000-0000-4000-8000-000000000503';
const counselorAccountId = '20000000-0000-4000-8000-000000000504';
const studentOneAccountId = '20000000-0000-4000-8000-000000000505';
const studentTwoAccountId = '20000000-0000-4000-8000-000000000506';
const counselorMembershipId = '50000000-0000-4000-8000-000000000501';
const classId = '40000000-0000-4000-8000-000000000501';
const legalDocIds = [
  '30000000-0000-4000-8000-000000000501',
  '30000000-0000-4000-8000-000000000502',
] as const;

const REG_PHONE = '13111111001';
const STUDENT_ONE_PHONE = '13111111020';

describe('Platform student account', () => {
  let registeredAccountId = '';

  beforeAll(async () => {
    await prisma.$connect();
    for (const [code, name, level, parentCode] of [
      ['110000', '北京市', 'PROVINCE', null],
      ['110100', '北京市', 'PREFECTURE', '110000'],
      ['640000', '宁夏回族自治区', 'PROVINCE', null],
      ['640100', '银川市', 'PREFECTURE', '640000'],
      ['640200', '石嘴山市', 'PREFECTURE', '640000'],
      ['640300', '吴忠市', 'PREFECTURE', '640000'],
    ] as const) {
      await prisma.administrativeDivision.upsert({
        where: { code },
        create: { code, name, level, parentCode, active: true },
        update: {},
      });
    }
    await prisma.legalDocumentVersion.deleteMany({
      where: { version: { startsWith: 'platform-account-' } },
    });
    await prisma.legalDocumentVersion.createMany({
      data: [
        {
          id: legalDocIds[0],
          type: 'USER_AGREEMENT',
          version: 'platform-account-1.0',
          status: 'PUBLISHED',
          contentHash: 'a'.repeat(64),
          publishedAt: new Date(),
        },
        {
          id: legalDocIds[1],
          type: 'PRIVACY_POLICY',
          version: 'platform-account-1.0',
          status: 'PUBLISHED',
          contentHash: 'b'.repeat(64),
          publishedAt: new Date(),
        },
      ],
    });
    await seedPublicAcademy();
    await seedUniversitySide();
  });

  afterEach(async () => {
    await prisma.phoneChangeRequest.deleteMany({
      where: {
        account: { id: { in: fixtureAccountIds() } },
      },
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('平台学员自助注册：验证码 + 协议 + 强制补齐，归入对应城市校区学院并冻结 90 天', async () => {
    const delivery = await registration.request({
      phone: REG_PHONE,
      captchaToken: CAPTCHA,
    });
    const session = await registration.confirm({
      phone: REG_PHONE,
      code: delivery.debugCode ?? '',
      consentDocumentVersionIds: [...legalDocIds],
      displayName: '林小满',
      gender: 'FEMALE',
      birthDate: '2005-03-15',
      registrationCityCode: '640100',
    });
    expect(session.token).toBeTruthy();
    expect(session.account.accountId).toBeTruthy();
    registeredAccountId = session.account.accountId;

    const account = await prisma.account.findUniqueOrThrow({
      where: { phone: REG_PHONE },
      include: { membership: true, studentProfile: true },
    });
    expect(account).toMatchObject({
      kind: 'END_USER',
      status: 'ACTIVE',
      displayName: '林小满',
      gender: 'FEMALE',
      profileCompletedAt: expect.any(Date),
    });
    expect(account.membership).toMatchObject({
      tenantId: academyTenantId,
      role: 'STUDENT',
    });
    expect(account.studentProfile).toMatchObject({
      kind: 'PLATFORM',
      registrationCityCode: '640100',
      residentCityCode: '640100',
    });
    const frozenDays =
      (account.studentProfile!.profileFrozenUntil!.getTime() - Date.now()) /
      (24 * 60 * 60 * 1000);
    expect(frozenDays).toBeGreaterThan(89);
    expect(frozenDays).toBeLessThan(91);

    await expect(
      registration.request({ phone: REG_PHONE, captchaToken: CAPTCHA }),
    ).rejects.toThrow(RegistrationPhoneOccupiedError);

    await expect(
      registration.confirm({
        phone: '13111111003',
        code: '000000',
        consentDocumentVersionIds: [...legalDocIds],
        displayName: '验证码错误',
        gender: 'MALE',
        birthDate: '2005-01-01',
        registrationCityCode: '640100',
      }),
    ).rejects.toThrow(InvalidRegistrationError);

    // 未预置校区：验证码通过后城市解析拒绝
    const noCampusDelivery = await registration.request({
      phone: '13111111004',
      captchaToken: CAPTCHA,
    });
    await expect(
      registration.confirm({
        phone: '13111111004',
        code: noCampusDelivery.debugCode ?? '',
        consentDocumentVersionIds: [...legalDocIds],
        displayName: '无校区城市',
        gender: 'MALE',
        birthDate: '2005-01-01',
        registrationCityCode: '110100',
      }),
    ).rejects.toThrow(PublicAcademyNotConfiguredError);

    const disabledCityDelivery = await registration.request({
      phone: '13111111005',
      captchaToken: CAPTCHA,
    });
    await expect(
      registration.confirm({
        phone: '13111111005',
        code: disabledCityDelivery.debugCode ?? '',
        consentDocumentVersionIds: [...legalDocIds],
        displayName: '停用城市',
        gender: 'MALE',
        birthDate: '2005-01-01',
        registrationCityCode: '640300',
      }),
    ).rejects.toThrow(RegistrationCityUnavailableError);
  });

  it('高校认证学员首登补齐出生年月日，重复补齐被拒', async () => {
    const view = await asActor(universityStudentAccountId, () =>
      profile.completeFirstLogin({ birthDate: '2006-09-01' }),
    );
    expect(view.birthDate).toBe('2006-09-01');
    expect(view.profileCompletedAt).toBeTruthy();
    expect(view.student?.lifecycleState).toBe('ENROLLED');

    await expect(
      asActor(universityStudentAccountId, () =>
        profile.completeFirstLogin({ birthDate: '2006-09-02' }),
      ),
    ).rejects.toThrow(ProfileCompletionConflictError);
  });

  it('平台学员 90 天冻结与滚动 365 天自改限制', async () => {
    await expect(
      asActor(registeredAccountId, () =>
        profile.updateResidentCity('640200'),
      ),
    ).rejects.toThrow(ProfileFrozenError);
    await expect(
      asActor(registeredAccountId, () =>
        profile.selfCorrectProfile({ displayName: '林小满改' }),
      ),
    ).rejects.toThrow(ProfileFrozenError);

    // 冻结期满：常驻城市可改；但自改受 365 天滚动限制（注册时点为基准）
    await prisma.studentProfile.update({
      where: { accountId: registeredAccountId },
      data: { profileFrozenUntil: new Date(Date.now() - 1000) },
    });
    await asActor(registeredAccountId, () =>
      profile.updateResidentCity('640200'),
    );
    await expect(
      asActor(registeredAccountId, () =>
        profile.selfCorrectProfile({ displayName: '林小满改' }),
      ),
    ).rejects.toThrow(SelfEditRateLimitedError);

    await prisma.studentProfile.update({
      where: { accountId: registeredAccountId },
      data: { lastSelfEditedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000) },
    });
    const corrected = await asActor(registeredAccountId, () =>
      profile.selfCorrectProfile({ displayName: '林小满改', gender: 'MALE' }),
    );
    expect(corrected.displayName).toBe('林小满改');
    expect(corrected.gender).toBe('MALE');
  });

  it('非学生账户三因素自助换绑直接生效', async () => {
    const oldDelivery = await asActor(staffAccountId, () =>
      phoneChange.requestOldVerification({ captchaToken: CAPTCHA }),
    );
    await expect(
      asActor(staffAccountId, () =>
        phoneChange.requestNewVerification({
          oldPhoneCode: '000000',
          newPhone: '13111111011',
          captchaToken: CAPTCHA,
        }),
      ),
    ).rejects.toThrow(PhoneChangeInvalidError);

    const newDelivery = await asActor(staffAccountId, () =>
      phoneChange.requestNewVerification({
        oldPhoneCode: oldDelivery.debugCode ?? '',
        newPhone: '13111111011',
        captchaToken: CAPTCHA,
      }),
    );
    const result = await asActor(staffAccountId, () =>
      phoneChange.confirmSelf({ newPhoneCode: newDelivery.debugCode ?? '' }),
    );
    expect(result).toEqual({
      applied: true,
      requiresCounselorConfirmation: false,
    });
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: staffAccountId } }),
    ).resolves.toMatchObject({ phone: '13111111011' });

    // 新号占用在发送前拦截
    const staffBOld = await asActor(staffBAccountId, () =>
      phoneChange.requestOldVerification({ captchaToken: CAPTCHA }),
    );
    await expect(
      asActor(staffBAccountId, () =>
        phoneChange.requestNewVerification({
          oldPhoneCode: staffBOld.debugCode ?? '',
          newPhone: REG_PHONE,
          captchaToken: CAPTCHA,
        }),
      ),
    ).rejects.toThrow(PhoneChangeTargetOccupiedError);
  });

  it('高校认证学员换绑须辅导员确认：通过后生效，驳回后保持原号', async () => {
    const oldDelivery = await asActor(studentOneAccountId, () =>
      phoneChange.requestOldVerification({ captchaToken: CAPTCHA }),
    );
    const newDelivery = await asActor(studentOneAccountId, () =>
      phoneChange.requestNewVerification({
        oldPhoneCode: oldDelivery.debugCode ?? '',
        newPhone: '13111111021',
        captchaToken: CAPTCHA,
      }),
    );
    const pending = await asActor(studentOneAccountId, () =>
      phoneChange.confirmSelf({ newPhoneCode: newDelivery.debugCode ?? '' }),
    );
    expect(pending).toEqual({
      applied: false,
      requiresCounselorConfirmation: true,
    });
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: studentOneAccountId } }),
    ).resolves.toMatchObject({ phone: STUDENT_ONE_PHONE });

    const list = await asCounselor(() => phoneChange.listPendingForCounselor());
    const mine = list.find((item) => item.studentAccountId === studentOneAccountId);
    expect(mine).toMatchObject({
      studentNumber: '2026050101',
      displayName: '确认学生',
      currentPhone: STUDENT_ONE_PHONE,
      newPhone: '13111111021',
      pendingDays: 0,
    });
    await asCounselor(() =>
      phoneChange.counselorResolve({
        requestId: mine!.requestId,
        approve: true,
      }),
    );
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: studentOneAccountId } }),
    ).resolves.toMatchObject({ phone: '13111111021' });

    // 第二名学生走驳回路径
    const oldTwo = await asActor(studentTwoAccountId, () =>
      phoneChange.requestOldVerification({ captchaToken: CAPTCHA }),
    );
    const newTwo = await asActor(studentTwoAccountId, () =>
      phoneChange.requestNewVerification({
        oldPhoneCode: oldTwo.debugCode ?? '',
        newPhone: '13111111024',
        captchaToken: CAPTCHA,
      }),
    );
    await asActor(studentTwoAccountId, () =>
      phoneChange.confirmSelf({ newPhoneCode: newTwo.debugCode ?? '' }),
    );
    const listTwo = await asCounselor(() => phoneChange.listPendingForCounselor());
    const target = listTwo.find(
      (item) => item.studentAccountId === studentTwoAccountId,
    );
    await asCounselor(() =>
      phoneChange.counselorResolve({ requestId: target!.requestId, approve: false }),
    );
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: studentTwoAccountId } }),
    ).resolves.toMatchObject({ phone: '13111111023' });
  });

  it('辅导员代发起（旧号丢失救济）：新号验证码核验后直接生效', async () => {
    const delivery = await asCounselor(() =>
      phoneChange.counselorInitiate({
        studentAccountId: studentOneAccountId,
        newPhone: '13111111025',
        captchaToken: CAPTCHA,
      }),
    );
    const pendingBefore = await prisma.phoneChangeRequest.findFirstOrThrow({
      where: { accountId: studentOneAccountId, status: 'PENDING_SMS' },
    });
    await asCounselor(() =>
      phoneChange.counselorVerify({
        requestId: pendingBefore.id,
        code: delivery.debugCode ?? '',
      }),
    );
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: studentOneAccountId } }),
    ).resolves.toMatchObject({ phone: '13111111025' });
    await expect(
      prisma.phoneChangeRequest.findUniqueOrThrow({
        where: { id: pendingBefore.id },
      }),
    ).resolves.toMatchObject({ status: 'APPLIED' });
  });

  function asActor<T>(accountId: string, callback: () => T): T {
    return requestContext.run(
      { requestId: 'platform-account-test', actorAccountId: accountId },
      callback,
    );
  }

  function asCounselor<T>(callback: () => T): T {
    return requestContext.run(
      {
        requestId: 'platform-account-counselor',
        actorAccountId: counselorAccountId,
        tenantId: universityTenantId,
        role: 'COUNSELOR',
      },
      callback,
    );
  }

  function fixtureAccountIds(): string[] {
    return [
      universityStudentAccountId,
      staffAccountId,
      staffBAccountId,
      counselorAccountId,
      studentOneAccountId,
      studentTwoAccountId,
      registeredAccountId,
    ].filter(Boolean);
  }

  async function seedPublicAcademy(): Promise<void> {
    await prisma.tenant.create({
      data: {
        id: academyTenantId,
        type: 'UNIVERSITY',
        name: '知行公开学院（账户测试）',
        university: { create: { isPublicAcademy: true } },
      },
    });
    for (const [code, disabled] of [
      ['640100', false],
      ['640200', false],
      ['640300', true],
    ] as const) {
      const name = `知行公开学院（账户测试）${code}校区`;
      const campus = await prisma.campus.create({
        data: {
          tenantId: academyTenantId,
          name,
          divisionCode: code,
          ...(disabled ? { status: 'DISABLED' } : {}),
        },
      });
      const college = await prisma.college.create({
        data: { tenantId: academyTenantId, name },
      });
      await prisma.collegeCampus.create({
        data: {
          tenantId: academyTenantId,
          collegeId: college.id,
          campusId: campus.id,
          sortOrder: 0,
        },
      });
    }
  }

  async function seedUniversitySide(): Promise<void> {
    await prisma.tenant.create({
      data: {
        id: universityTenantId,
        type: 'UNIVERSITY',
        name: '知行工坊账户测试高校',
        university: { create: {} },
      },
    });
    const college = await prisma.college.create({
      data: { tenantId: universityTenantId, name: '账户测试学院' },
    });
    const major = await prisma.major.create({
      data: { tenantId: universityTenantId, collegeId: college.id, name: '账户测试专业' },
    });
    await prisma.account.create({
      data: {
        id: counselorAccountId,
        kind: 'END_USER',
        phone: '13111111030',
        displayName: '账户测试辅导员',
        status: 'ACTIVE',
        membership: {
          create: {
            id: counselorMembershipId,
            tenantId: universityTenantId,
            role: 'COUNSELOR',
            collegeId: college.id,
          },
        },
      },
    });
    await prisma.cohortClass.create({
      data: {
        id: classId,
        tenantId: universityTenantId,
        majorId: major.id,
        name: '账户 2601',
        gradeLabel: '2026',
        counselorMembershipId,
      },
    });
    for (const [accountId, phone, studentNumber] of [
      [universityStudentAccountId, '13111111019', '2026050100'],
      [studentOneAccountId, STUDENT_ONE_PHONE, '2026050101'],
      [studentTwoAccountId, '13111111023', '2026050102'],
    ] as const) {
      await prisma.account.create({
        data: {
          id: accountId,
          kind: 'END_USER',
          phone,
          displayName: studentNumber === '2026050101' ? '确认学生' : '账户测试学生',
          gender: 'MALE',
          status: 'ACTIVE',
          membership: {
            create: { tenantId: universityTenantId, role: 'STUDENT' },
          },
          studentProfile: {
            create: {
              tenantId: universityTenantId,
              kind: 'UNIVERSITY_CERTIFIED',
              studentNumber,
              classId,
            },
          },
        },
      });
    }
    for (const [accountId, phone] of [
      [staffAccountId, '13111111010'],
      [staffBAccountId, '13111111012'],
    ] as const) {
      await prisma.account.create({
        data: {
          id: accountId,
          kind: 'END_USER',
          phone,
          displayName: '账户测试教职工',
          status: 'ACTIVE',
          membership: {
            create: { tenantId: universityTenantId, role: 'PROGRAM_LEAD' },
          },
        },
      });
    }
  }

  async function cleanFixtures(): Promise<void> {
    await prisma.phoneChangeRequest.deleteMany({
      where: { account: { id: { in: fixtureAccountIds() } } },
    });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorAccountId: { in: fixtureAccountIds() } },
          { targetId: { in: fixtureAccountIds() } },
        ],
      },
    });
    await prisma.protocolConsent.deleteMany({
      where: { accountId: { in: fixtureAccountIds() } },
    });
    await prisma.authSession.deleteMany({
      where: { accountId: { in: fixtureAccountIds() } },
    });
    await prisma.studentProfile.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.cohortClass.deleteMany({
      where: { tenantId: universityTenantId },
    });
    await prisma.major.deleteMany({ where: { tenantId: universityTenantId } });
    await prisma.membership.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.collegeCampus.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.college.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.campus.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: fixtureAccountIds() } },
    });
    await prisma.university.deleteMany({
      where: { tenantId: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [academyTenantId, universityTenantId] } },
    });
    await prisma.legalDocumentVersion.deleteMany({
      where: { version: { startsWith: 'platform-account-' } },
    });
  }
});
