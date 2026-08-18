import { generate } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { RequestContextService } from '../../src/infrastructure/request-context/request-context.service';
import { AccountSecurityService } from '../../src/modules/identity/application/account-security.service';
import { ActivationCodeService } from '../../src/modules/identity/application/activation-code.service';
import { IdentityService } from '../../src/modules/identity/application/identity.service';
import { LoginThrottleService } from '../../src/modules/identity/application/login-throttle.service';
import { PlatformAccountAdminService } from '../../src/modules/identity/application/platform-account-admin.service';
import { PlatformAccountEnrollmentService } from '../../src/modules/identity/application/platform-account-enrollment.service';
import { CounselorStudentSecurityService } from '../../src/modules/identity/application/counselor-student-security.service';
import { ProtocolConsentService } from '../../src/modules/identity/application/protocol-consent.service';
import { SmsLoginService } from '../../src/modules/identity/application/sms-login.service';
import { UserAccountActivationService } from '../../src/modules/identity/application/user-account-activation.service';
import { PasswordHasher } from '../../src/modules/identity/domain/password-hasher';
import { TotpCipher } from '../../src/modules/identity/domain/totp-cipher';
import { TotpService } from '../../src/modules/identity/domain/totp.service';
import {
  MockCaptchaAdapter,
  MockSmsAdapter,
} from '../../src/modules/integration/mock-integration.adapters';
import { LegalDocumentGovernanceService } from '../../src/modules/governance/legal-document-governance.service';
import { OrganizationAdminService } from '../../src/modules/organization/application/organization-admin.service';

const prisma = new PrismaService();
const redis = new RedisService();
const passwordHasher = new PasswordHasher();
const totpCipher = new TotpCipher();
const totp = new TotpService();
const requestContext = new RequestContextService();
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
const accountSecurity = new AccountSecurityService(
  prisma,
  requestContext,
  passwordHasher,
  totpCipher,
  totp,
  identity,
);
const organizationAdmin = new OrganizationAdminService(
  prisma,
  requestContext,
);
const platformAccountAdmin = new PlatformAccountAdminService(
  prisma,
  requestContext,
  passwordHasher,
);
const counselorStudentSecurity = new CounselorStudentSecurityService(
  prisma,
  requestContext,
);
const platformEnrollment = new PlatformAccountEnrollmentService(
  prisma,
  passwordHasher,
  totpCipher,
  totp,
  identity,
  loginThrottle,
  protocolConsents,
  requestContext,
);
const userActivation = new UserAccountActivationService(
  prisma,
  activationCodes,
  passwordHasher,
  identity,
  protocolConsents,
);
const smsLogin = new SmsLoginService(
  prisma,
  activationCodes,
  protocolConsents,
  identity,
);
const legalGovernance = new LegalDocumentGovernanceService(
  prisma,
  requestContext,
);
const tenantId = '10000000-0000-4000-8000-000000000001';
const accountIds = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
] as const;
const counselorAccountId = '20000000-0000-4000-8000-000000000011';
const otherCounselorAccountId = '20000000-0000-4000-8000-000000000012';
const studentAccountId = '20000000-0000-4000-8000-000000000013';
const counselorMembershipId = '50000000-0000-4000-8000-000000000001';
const otherCounselorMembershipId = '50000000-0000-4000-8000-000000000002';
const collegeId = '40000000-0000-4000-8000-000000000001';
const majorId = '40000000-0000-4000-8000-000000000002';
const classId = '40000000-0000-4000-8000-000000000003';
const activationTestPhones = [
  '13300133000',
  '13200132000',
  '13100131000',
] as const;
const legalDocumentIds = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
] as const;

describe('Identity + Organization database invariants', () => {
  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    process.env.INTEGRATION_MODE = 'mock';
    process.env.REDIS_URL = 'redis://localhost:6379';
    await prisma.$connect();
    await redis.connection();
  });

  afterEach(cleanFixtures);

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
    await redis.onModuleDestroy();
  });

  it('拒绝不符合平台管理账号凭据形态的数据', async () => {
    await expect(
      prisma.account.create({
        data: {
          id: accountIds[0],
          kind: 'PLATFORM_ADMIN',
          phone: '13800138000',
          username: 'invalid-platform-account',
          displayName: '非法平台账号',
        },
      }),
    ).rejects.toThrow();
  });

  it('在数据库层保证手机号全平台唯一', async () => {
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone: '13800138000',
        displayName: '测试用户一',
      },
    });

    await expect(
      prisma.account.create({
        data: {
          id: accountIds[1],
          kind: 'END_USER',
          phone: '13800138000',
          displayName: '测试用户二',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('全平台只允许一个启用中的超管', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.createMany({
      data: [
        {
          id: accountIds[0],
          kind: 'PLATFORM_ADMIN',
          username: 'integration-super-admin-1',
          displayName: '测试超管一',
          status: 'ACTIVE',
        },
        {
          id: accountIds[1],
          kind: 'PLATFORM_ADMIN',
          username: 'integration-super-admin-2',
          displayName: '测试超管二',
          status: 'ACTIVE',
        },
      ],
    });
    await prisma.membership.create({
      data: {
        accountId: accountIds[0],
        tenantId,
        role: 'SUPER_ADMIN',
      },
    });

    await expect(
      prisma.membership.create({
        data: {
          accountId: accountIds[1],
          tenantId,
          role: 'SUPER_ADMIN',
        },
      }),
    ).rejects.toThrow();
  });

  it('数据库拒绝给手机号用户分配任何平台管理角色', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone: '13600136000',
        displayName: '错误平台账号',
      },
    });

    await expect(
      prisma.membership.create({
        data: {
          accountId: accountIds[0],
          tenantId,
          role: 'ORGANIZATION_ADMIN',
        },
      }),
    ).rejects.toThrow();
  });

  it('密码登录只落会话哈希并支持解析与撤销', async () => {
    const password = 'Integration-Password-2026';
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone: '13900139000',
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试高校管理员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'UNIVERSITY_ADMIN',
          },
        },
      },
    });

    const created = await identity.createUserPasswordSession({
      phone: '13900139000',
      password,
      consentDocumentVersionIds: [],
      deviceSummary: 'integration-test',
    });
    const persisted = await prisma.authSession.findFirstOrThrow({
      where: { accountId: accountIds[0] },
    });

    expect(persisted.tokenHash).not.toBe(created.token);
    await expect(identity.resolveSession(created.token)).resolves.toMatchObject({
      accountId: accountIds[0],
      tenantId,
      role: 'UNIVERSITY_ADMIN',
    });

    await identity.revokeSession(created.token);
    await expect(identity.resolveSession(created.token)).resolves.toBeNull();
  });

  it('Mock CAPTCHA 与短信验证码可激活手机号租户管理员', async () => {
    const phone = activationTestPhones[0];
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试用户激活高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone,
        displayName: '测试待激活校管',
        status: 'PENDING_ACTIVATION',
        membership: {
          create: {
            tenantId,
            role: 'UNIVERSITY_ADMIN',
          },
        },
      },
    });

    const captcha = await activationCodes.issueCaptchaChallenge();
    expect(captcha).toMatchObject({ mock: true });
    const delivery = await userActivation.request({
      phone,
      captchaToken: captcha.token,
    });
    expect(delivery).toMatchObject({ mock: true });
    expect(delivery.debugCode).toMatch(/^\d{6}$/);
    await expect(
      userActivation.request({
        phone,
        captchaToken: captcha.token,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 60 });

    const session = await userActivation.confirm({
      phone,
      code: delivery.debugCode ?? '',
      password: 'Activated-Password-2026',
      consentDocumentVersionIds: [],
    });
    await expect(identity.resolveSession(session.token)).resolves.toMatchObject({
      accountId: accountIds[0],
      role: 'UNIVERSITY_ADMIN',
    });
    await expect(
      prisma.account.findUniqueOrThrow({
        where: { id: accountIds[0] },
      }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
      profileCompletedAt: expect.any(Date),
    });
  });

  it('协议更新约束下次密码与短信登录但不即时踢掉既有会话', async () => {
    const phone = activationTestPhones[1];
    const password = 'Consent-Password-2026';
    await prisma.legalDocumentVersion.createMany({
      data: [
        {
          id: legalDocumentIds[0],
          type: 'USER_AGREEMENT',
          version: 'integration-1.0',
          status: 'PUBLISHED',
          contentHash: 'a'.repeat(64),
          publishedAt: new Date(),
        },
        {
          id: legalDocumentIds[1],
          type: 'PRIVACY_POLICY',
          version: 'integration-1.0',
          status: 'PUBLISHED',
          contentHash: 'b'.repeat(64),
          publishedAt: new Date(),
        },
      ],
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试协议门禁高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone,
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试协议账号',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'UNIVERSITY_ADMIN',
          },
        },
      },
    });

    await expect(
      identity.createUserPasswordSession({
        phone,
        password,
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('Current user agreement');
    const documentVersionIds = [legalDocumentIds[0], legalDocumentIds[1]];
    const passwordSession = await identity.createUserPasswordSession({
      phone,
      password,
      consentDocumentVersionIds: documentVersionIds,
    });
    await expect(
      identity.resolveSession(passwordSession.token),
    ).resolves.not.toBeNull();
    await expect(
      prisma.protocolConsent.count({
        where: { accountId: accountIds[0] },
      }),
    ).resolves.toBe(2);

    const captcha = await activationCodes.issueCaptchaChallenge();
    const delivery = await smsLogin.request({
      phone,
      captchaToken: captcha.token,
    });
    const smsSession = await smsLogin.confirm({
      phone,
      code: delivery.debugCode ?? '',
      consentDocumentVersionIds: documentVersionIds,
    });
    await expect(identity.resolveSession(smsSession.token)).resolves.not.toBeNull();

    await prisma.$transaction([
      prisma.legalDocumentVersion.update({
        where: { id: legalDocumentIds[0] },
        data: { status: 'RETIRED' },
      }),
      prisma.legalDocumentVersion.create({
        data: {
          id: legalDocumentIds[2],
          type: 'USER_AGREEMENT',
          version: 'integration-1.1',
          status: 'PUBLISHED',
          contentHash: 'c'.repeat(64),
          publishedAt: new Date(),
        },
      }),
    ]);
    await expect(
      identity.resolveSession(smsSession.token),
    ).resolves.not.toBeNull();
    await expect(
      identity.createUserPasswordSession({
        phone,
        password,
        consentDocumentVersionIds: documentVersionIds,
      }),
    ).rejects.toThrow('Current user agreement');
    await expect(
      identity.createUserPasswordSession({
        phone,
        password,
        consentDocumentVersionIds: [
          legalDocumentIds[2],
          legalDocumentIds[1],
        ],
      }),
    ).resolves.toBeDefined();
  });

  it('运营专员可成对发布法务文本且旧版本原子退役', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试法务治理平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'PLATFORM_ADMIN',
        username: 'integration-legal-operator',
        phone: null,
        displayName: '测试法务运营',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'OPERATIONS_SPECIALIST',
          },
        },
      },
    });
    const governanceContext = {
      requestId: 'legal-governance',
      actorAccountId: accountIds[0],
      tenantId,
      role: 'OPERATIONS_SPECIALIST' as const,
    };

    const agreement = await requestContext.run(governanceContext, () =>
      legalGovernance.createDraft({
        type: 'USER_AGREEMENT',
        version: 'governance-1.0',
        content: '# 用户协议\n首版正文',
      }),
    );
    const privacy = await requestContext.run(governanceContext, () =>
      legalGovernance.createDraft({
        type: 'PRIVACY_POLICY',
        version: 'governance-1.0',
        content: '# 隐私政策\n首版正文',
      }),
    );
    await requestContext.run(governanceContext, () =>
      legalGovernance.publishSet(agreement.id, privacy.id),
    );
    await expect(protocolConsents.getCurrentDocuments()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agreement.id,
          content: '# 用户协议\n首版正文',
        }),
        expect.objectContaining({
          id: privacy.id,
          content: '# 隐私政策\n首版正文',
        }),
      ]),
    );

    const agreementV2 = await requestContext.run(governanceContext, () =>
      legalGovernance.createDraft({
        type: 'USER_AGREEMENT',
        version: 'governance-1.1',
        content: '# 用户协议\n第二版正文',
      }),
    );
    const privacyV2 = await requestContext.run(governanceContext, () =>
      legalGovernance.createDraft({
        type: 'PRIVACY_POLICY',
        version: 'governance-1.1',
        content: '# 隐私政策\n第二版正文',
      }),
    );
    await requestContext.run(governanceContext, () =>
      legalGovernance.publishSet(agreementV2.id, privacyV2.id),
    );
    await expect(
      prisma.legalDocumentVersion.findMany({
        where: { id: { in: [agreement.id, privacy.id] } },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ status: 'RETIRED' }),
      expect.objectContaining({ status: 'RETIRED' }),
    ]);
  });

  it('普通账号绑定 TOTP 后密码与短信登录均强制二次验证', async () => {
    const phone = activationTestPhones[2];
    const password = 'Ordinary-Totp-Password-2026';
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试普通账号 TOTP 高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone,
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试普通 TOTP 账号',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'UNIVERSITY_ADMIN',
          },
        },
      },
    });
    const existingSession = await identity.createUserPasswordSession({
      phone,
      password,
      consentDocumentVersionIds: [],
    });

    const enrollment = await requestContext.run(
      {
        requestId: 'ordinary-totp-start',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      () => accountSecurity.startTotpEnrollment(password),
    );
    const firstTotpCode = await generate({ secret: enrollment.secret });
    const recoveryCodes = await requestContext.run(
      {
        requestId: 'ordinary-totp-confirm',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      () => accountSecurity.confirmTotpEnrollment(firstTotpCode),
    );
    expect(recoveryCodes).toHaveLength(10);

    await expect(
      identity.createUserPasswordSession({
        phone,
        password,
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('TOTP or recovery code');
    await expect(
      identity.createUserPasswordSession({
        phone,
        password,
        secondFactorCode: recoveryCodes[0],
        consentDocumentVersionIds: [],
      }),
    ).resolves.toBeDefined();

    const captcha = await activationCodes.issueCaptchaChallenge();
    const firstDelivery = await smsLogin.request({
      phone,
      captchaToken: captcha.token,
    });
    expect(firstDelivery.secondFactorRequired).toBe(true);
    await expect(
      smsLogin.confirm({
        phone,
        code: firstDelivery.debugCode ?? '',
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('TOTP or recovery code');

    await (await redis.connection()).del(
      `identity:activation:cooldown:${phone}`,
    );
    const secondDelivery = await smsLogin.request({
      phone,
      captchaToken: captcha.token,
    });
    const smsSession = await smsLogin.confirm({
      phone,
      code: secondDelivery.debugCode ?? '',
      secondFactorCode: recoveryCodes[1],
      consentDocumentVersionIds: [],
    });
    await expect(identity.resolveSession(smsSession.token)).resolves.not.toBeNull();

    await requestContext.run(
      {
        requestId: 'ordinary-password-change',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      () =>
        accountSecurity.changePassword(
          password,
          'Changed-Ordinary-Password-2026',
          recoveryCodes[2],
        ),
    );
    await expect(
      identity.resolveSession(existingSession.token),
    ).resolves.toBeNull();
    await expect(identity.resolveSession(smsSession.token)).resolves.toBeNull();

    await requestContext.run(
      {
        requestId: 'ordinary-totp-disable',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'UNIVERSITY_ADMIN',
      },
      () =>
        accountSecurity.disableTotp(
          'Changed-Ordinary-Password-2026',
          recoveryCodes[3] ?? '',
        ),
    );
    await expect(
      identity.createUserPasswordSession({
        phone,
        password: 'Changed-Ordinary-Password-2026',
        consentDocumentVersionIds: [],
      }),
    ).resolves.toBeDefined();
  });

  it('连续五次登录失败锁定十五分钟，过期后成功登录清零', async () => {
    const password = 'Throttle-Password-2026';
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试登录锁定高校',
        university: { create: {} },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'END_USER',
        phone: '13500135000',
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试锁定账号',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'UNIVERSITY_ADMIN',
          },
        },
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        identity.createUserPasswordSession({
          phone: '13500135000',
          password: 'wrong-password',
          consentDocumentVersionIds: [],
        }),
      ).rejects.toThrow('Invalid credentials');
    }
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: accountIds[0] } }),
    ).resolves.toMatchObject({
      failedLoginCount: 5,
    });
    await expect(
      identity.createUserPasswordSession({
        phone: '13500135000',
        password,
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('Invalid credentials');

    await prisma.account.update({
      where: { id: accountIds[0] },
      data: { lockedUntil: new Date(Date.now() - 1_000) },
    });
    await expect(
      identity.createUserPasswordSession({
        phone: '13500135000',
        password,
        consentDocumentVersionIds: [],
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: accountIds[0] } }),
    ).resolves.toMatchObject({
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it('平台账号仅用用户名、密码与 TOTP 登录且拒绝动态码重放', async () => {
    const username = 'integration-platform-admin';
    const password = 'Platform-Password-2026';
    const enrollment = totp.createEnrollment(username);
    const encrypted = totpCipher.encrypt(accountIds[0], enrollment.secret);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'PLATFORM_ADMIN',
        username,
        phone: null,
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试平台管理员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'SUPER_ADMIN',
          },
        },
        totpCredential: {
          create: {
            secretCiphertext: Uint8Array.from(encrypted.ciphertext),
            secretIv: Uint8Array.from(encrypted.iv),
            secretAuthTag: Uint8Array.from(encrypted.authTag),
            enabledAt: new Date(),
          },
        },
      },
    });

    const token = await generate({ secret: enrollment.secret });
    const created = await identity.createPlatformSession({
      username,
      password,
      secondFactorCode: token,
      consentDocumentVersionIds: [],
    });
    await expect(identity.resolveSession(created.token)).resolves.toMatchObject({
      accountId: accountIds[0],
      role: 'SUPER_ADMIN',
    });
    await expect(
      identity.createPlatformSession({
        username,
        password,
        secondFactorCode: token,
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('只有平台组织管理员可创建高校及其手机号校级管理员', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'PLATFORM_ADMIN',
        username: 'integration-organization-admin',
        phone: null,
        displayName: '测试组织管理员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'ORGANIZATION_ADMIN',
          },
        },
      },
    });

    const created = await requestContext.run(
      {
        requestId: 'integration-request',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'ORGANIZATION_ADMIN',
      },
      () =>
        organizationAdmin.createUniversity({
          name: '知行工坊测试创建高校',
          initialAdmin: {
            displayName: '测试校级管理员',
            phone: '13700137000',
          },
        }),
    );
    const initialAdmin = await prisma.account.findUniqueOrThrow({
      where: { id: created.initialAdminAccountId },
      include: { membership: true },
    });

    expect(created.type).toBe('UNIVERSITY');
    expect(initialAdmin).toMatchObject({
      kind: 'END_USER',
      phone: '13700137000',
      username: null,
      status: 'PENDING_ACTIVATION',
      membership: {
        tenantId: created.tenantId,
        role: 'UNIVERSITY_ADMIN',
      },
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          tenantId: created.tenantId,
          action: 'tenant.created',
        },
      }),
    ).resolves.toMatchObject({ actorAccountId: accountIds[0] });
  });

  it('超管创建的平台账号须改密并绑定 TOTP 后才能登录', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'PLATFORM_ADMIN',
        username: 'integration-super-admin',
        phone: null,
        displayName: '测试超管',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'SUPER_ADMIN',
          },
        },
      },
    });

    await expect(
      requestContext.run(
        {
          requestId: 'super-admin-tenant-create-denied',
          actorAccountId: accountIds[0],
          tenantId,
          role: 'SUPER_ADMIN',
        },
        () =>
          organizationAdmin.createUniversity({
            name: '知行工坊测试超管越权高校',
            initialAdmin: {
              displayName: '不应创建的管理员',
              phone: '13400134000',
            },
          }),
      ),
    ).rejects.toThrow(
      'Only a platform organization administrator can open tenants',
    );

    const managed = await requestContext.run(
      {
        requestId: 'platform-account-create',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'SUPER_ADMIN',
      },
      () =>
        platformAccountAdmin.create({
          username: 'integration-ops-admin',
          displayName: '测试运营专员',
          role: 'OPERATIONS_SPECIALIST',
        }),
    );
    expect(managed.initialPassword).toHaveLength(28);
    for (const [username, displayName, role] of [
      [
        'integration-organization-manager',
        '测试组织管理员',
        'ORGANIZATION_ADMIN',
      ],
      [
        'integration-platform-dashboard',
        '测试平台看板',
        'PLATFORM_DASHBOARD',
      ],
    ] as const) {
      const created = await requestContext.run(
        {
          requestId: `platform-account-create-${role}`,
          actorAccountId: accountIds[0],
          tenantId,
          role: 'SUPER_ADMIN',
        },
        () => platformAccountAdmin.create({ username, displayName, role }),
      );
      await expect(
        prisma.account.findUniqueOrThrow({
          where: { id: created.accountId },
        }),
      ).resolves.toMatchObject({
        kind: 'PLATFORM_ADMIN',
        phone: null,
        status: 'PENDING_ACTIVATION',
      });
    }
    await expect(
      identity.createPlatformSession({
        username: managed.username,
        password: managed.initialPassword,
        secondFactorCode: '000000',
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('Invalid credentials');

    const started = await requestContext.run(
      { requestId: 'platform-enrollment-start' },
      () =>
        platformEnrollment.start({
          username: managed.username,
          initialPassword: managed.initialPassword,
        }),
    );
    expect(started.totpSecret).toBeTruthy();
    const enrollmentTotpCode = await generate({
      secret: started.totpSecret,
    });
    const confirmed = await requestContext.run(
      { requestId: 'platform-enrollment-security' },
      () =>
        platformEnrollment.confirm({
          enrollmentToken: started.enrollmentToken,
          newPassword: 'Changed-Password-2026',
          totpCode: enrollmentTotpCode,
        }),
    );
    expect(confirmed.recoveryCodes).toHaveLength(10);
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: managed.accountId } }),
    ).resolves.toMatchObject({
      status: 'PENDING_ACTIVATION',
    });
    await expect(
      requestContext.run(
        { requestId: 'platform-enrollment-unconfirmed' },
        () =>
          platformEnrollment.finish({
            recoveryCodesConfirmationToken:
              confirmed.recoveryCodesConfirmationToken,
            recoveryCodesSaved: false,
            consentDocumentVersionIds: [],
          }),
      ),
    ).rejects.toThrow('Invalid credentials');

    const activatedSession = await requestContext.run(
      { requestId: 'platform-enrollment-finish' },
      () =>
        platformEnrollment.finish({
          recoveryCodesConfirmationToken:
            confirmed.recoveryCodesConfirmationToken,
          recoveryCodesSaved: true,
          consentDocumentVersionIds: [],
        }),
    );
    await expect(
      identity.resolveSession(activatedSession.token),
    ).resolves.toMatchObject({
      accountId: managed.accountId,
      role: 'OPERATIONS_SPECIALIST',
    });

    const recovered = await identity.createPlatformSession({
      username: managed.username,
      password: 'Changed-Password-2026',
      secondFactorCode: confirmed.recoveryCodes[0] ?? '',
      consentDocumentVersionIds: [],
    });
    await expect(identity.resolveSession(recovered.token)).resolves.not.toBeNull();

    await requestContext.run(
      {
        requestId: 'platform-account-disable',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'SUPER_ADMIN',
      },
      () => platformAccountAdmin.disable(managed.accountId),
    );
    await expect(identity.resolveSession(recovered.token)).resolves.toBeNull();
    await expect(
      prisma.account.findUniqueOrThrow({
        where: { id: managed.accountId },
      }),
    ).resolves.toMatchObject({
      kind: 'PLATFORM_ADMIN',
      phone: null,
      status: 'SUSPENDED',
    });
  });

  it('超管重置下属平台账号 TOTP 后须用原密码重新激活', async () => {
    const username = 'integration-ops-totp-reset';
    const password = 'Reset-Password-2026';
    const enrollment = totp.createEnrollment(username);
    const encrypted = totpCipher.encrypt(accountIds[1], enrollment.secret);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'PLATFORM',
        name: '知行工坊测试平台',
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[0],
        kind: 'PLATFORM_ADMIN',
        username: 'integration-super-admin-reset',
        phone: null,
        displayName: '测试超管',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'SUPER_ADMIN',
          },
        },
      },
    });
    await prisma.account.create({
      data: {
        id: accountIds[1],
        kind: 'PLATFORM_ADMIN',
        username,
        phone: null,
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试运营专员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'OPERATIONS_SPECIALIST',
          },
        },
        totpCredential: {
          create: {
            secretCiphertext: Uint8Array.from(encrypted.ciphertext),
            secretIv: Uint8Array.from(encrypted.iv),
            secretAuthTag: Uint8Array.from(encrypted.authTag),
            enabledAt: new Date(),
          },
        },
      },
    });

    const token = await generate({ secret: enrollment.secret });
    const session = await identity.createPlatformSession({
      username,
      password,
      secondFactorCode: token,
      consentDocumentVersionIds: [],
    });

    await requestContext.run(
      {
        requestId: 'platform-totp-reset',
        actorAccountId: accountIds[0],
        tenantId,
        role: 'SUPER_ADMIN',
      },
      () => platformAccountAdmin.resetTotp(accountIds[1]),
    );

    await expect(identity.resolveSession(session.token)).resolves.toBeNull();
    await expect(
      prisma.account.findUniqueOrThrow({ where: { id: accountIds[1] } }),
    ).resolves.toMatchObject({
      status: 'PENDING_ACTIVATION',
      passwordHash: expect.any(String),
    });
    await expect(
      prisma.totpCredential.findUnique({
        where: { accountId: accountIds[1] },
      }),
    ).resolves.toBeNull();
    await expect(
      identity.createPlatformSession({
        username,
        password,
        secondFactorCode: token,
        consentDocumentVersionIds: [],
      }),
    ).rejects.toThrow('Invalid credentials');

    const started = await requestContext.run(
      { requestId: 'platform-totp-reset-enroll' },
      () =>
        platformEnrollment.start({
          username,
          initialPassword: password,
        }),
    );
    const enrollTotpCode = await generate({ secret: started.totpSecret });
    const confirmed = await requestContext.run(
      { requestId: 'platform-totp-reset-confirm' },
      () =>
        platformEnrollment.confirm({
          enrollmentToken: started.enrollmentToken,
          newPassword: 'Reset-Password-Changed-2026',
          totpCode: enrollTotpCode,
        }),
    );
    await requestContext.run(
      { requestId: 'platform-totp-reset-finish' },
      () =>
        platformEnrollment.finish({
          recoveryCodesConfirmationToken:
            confirmed.recoveryCodesConfirmationToken,
          recoveryCodesSaved: true,
          consentDocumentVersionIds: [],
        }),
    );
    await expect(
      identity.createPlatformSession({
        username,
        password: 'Reset-Password-Changed-2026',
        secondFactorCode: confirmed.recoveryCodes[0] ?? '',
        consentDocumentVersionIds: [],
      }),
    ).resolves.toBeDefined();
  });

  it('辅导员只能关闭本人管辖班级在读认证学员的 TOTP', async () => {
    const studentPhone = '13600136000';
    const password = 'Student-Password-2026';
    const enrollment = totp.createEnrollment(studentPhone);
    const encrypted = totpCipher.encrypt(studentAccountId, enrollment.secret);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        type: 'UNIVERSITY',
        name: '知行工坊测试高校',
        university: { create: {} },
      },
    });
    await prisma.college.create({
      data: {
        id: collegeId,
        tenantId,
        name: '测试学院',
      },
    });
    await prisma.account.create({
      data: {
        id: counselorAccountId,
        kind: 'END_USER',
        phone: '13900139000',
        displayName: '测试辅导员',
        status: 'ACTIVE',
        membership: {
          create: {
            id: counselorMembershipId,
            tenantId,
            role: 'COUNSELOR',
            collegeId,
          },
        },
      },
    });
    await prisma.account.create({
      data: {
        id: otherCounselorAccountId,
        kind: 'END_USER',
        phone: '13900139001',
        displayName: '其他辅导员',
        status: 'ACTIVE',
        membership: {
          create: {
            id: otherCounselorMembershipId,
            tenantId,
            role: 'COUNSELOR',
            collegeId,
          },
        },
      },
    });
    await prisma.major.create({
      data: {
        id: majorId,
        tenantId,
        collegeId,
        name: '测试专业',
      },
    });
    await prisma.cohortClass.create({
      data: {
        id: classId,
        tenantId,
        majorId,
        counselorMembershipId,
        name: '测试班',
        gradeLabel: '2026',
      },
    });
    await prisma.account.create({
      data: {
        id: studentAccountId,
        kind: 'END_USER',
        phone: studentPhone,
        passwordHash: await passwordHasher.hash(password),
        displayName: '测试学员',
        status: 'ACTIVE',
        membership: {
          create: {
            tenantId,
            role: 'STUDENT',
          },
        },
        studentProfile: {
          create: {
            tenantId,
            kind: 'UNIVERSITY_CERTIFIED',
            studentNumber: '20260001',
            lifecycleState: 'ENROLLED',
            classId,
          },
        },
        totpCredential: {
          create: {
            secretCiphertext: Uint8Array.from(encrypted.ciphertext),
            secretIv: Uint8Array.from(encrypted.iv),
            secretAuthTag: Uint8Array.from(encrypted.authTag),
            enabledAt: new Date(),
          },
        },
      },
    });

    const token = await generate({ secret: enrollment.secret });
    const session = await identity.createUserPasswordSession({
      phone: studentPhone,
      password,
      secondFactorCode: token,
      consentDocumentVersionIds: [],
    });

    await expect(
      requestContext.run(
        {
          requestId: 'other-counselor-totp-disable',
          actorAccountId: otherCounselorAccountId,
          tenantId,
          role: 'COUNSELOR',
        },
        () => counselorStudentSecurity.disableStudentTotp(studentAccountId),
      ),
    ).rejects.toThrow('Enrolled certified student');

    await requestContext.run(
      {
        requestId: 'counselor-totp-disable',
        actorAccountId: counselorAccountId,
        tenantId,
        role: 'COUNSELOR',
      },
      () => counselorStudentSecurity.disableStudentTotp(studentAccountId),
    );

    await expect(identity.resolveSession(session.token)).resolves.toBeNull();
    await expect(
      identity.createUserPasswordSession({
        phone: studentPhone,
        password,
        consentDocumentVersionIds: [],
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'student.totp.disabled_by_counselor',
          targetId: studentAccountId,
        },
      }),
    ).resolves.toMatchObject({ actorAccountId: counselorAccountId });
  });
});

async function cleanFixtures(): Promise<void> {
  const redisConnection = await redis.connection();
  await redisConnection.del(
    ...activationTestPhones.flatMap((phone) => [
      `identity:activation:code:${phone}`,
      `identity:login:code:${phone}`,
      `identity:activation:cooldown:${phone}`,
      `identity:activation:hourly:${phone}`,
    ]),
  );
  const fixtureTenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { id: tenantId },
        { name: { startsWith: '知行工坊测试' } },
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
      ...accountIds,
      counselorAccountId,
      otherCounselorAccountId,
      studentAccountId,
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
  await prisma.authSession.deleteMany({
    where: { accountId: { in: fixtureAccountIds } },
  });
  await prisma.platformAccountEnrollment.deleteMany({
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
  await prisma.totpRecoveryCode.deleteMany({
    where: { accountId: { in: fixtureAccountIds } },
  });
  await prisma.totpCredential.deleteMany({
    where: { accountId: { in: fixtureAccountIds } },
  });
  await prisma.account.deleteMany({
    where: { id: { in: fixtureAccountIds } },
  });
  await prisma.governmentUniversityScope.deleteMany({
    where: {
      OR: [
        { governmentTenantId: { in: fixtureTenantIds } },
        { universityTenantId: { in: fixtureTenantIds } },
      ],
    },
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
  await prisma.tenant.deleteMany({
    where: { id: { in: fixtureTenantIds } },
  });
  await prisma.legalDocumentVersion.deleteMany({
    where: {
      OR: [
        { id: { in: [...legalDocumentIds] } },
        { version: { startsWith: 'governance-' } },
      ],
    },
  });
}
