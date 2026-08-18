import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
  StudentKind,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { ActivationCodeService } from './activation-code.service';
import {
  CreatedPasswordSession,
  IdentityService,
} from './identity.service';
import { ProtocolConsentService } from './protocol-consent.service';

const PROFILE_FREEZE_DAYS = 90;

export interface RequestRegistrationInput {
  phone: string;
  captchaToken: string;
}

export interface ConfirmRegistrationInput {
  phone: string;
  code: string;
  consentDocumentVersionIds: string[];
  displayName: string;
  gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
  birthDate: string;
  registrationCityCode: string;
  ipAddress?: string;
  deviceSummary?: string;
}

export class RegistrationPhoneOccupiedError extends Error {
  constructor() {
    super('Phone number is already registered on the platform');
    this.name = 'RegistrationPhoneOccupiedError';
  }
}

export class InvalidRegistrationError extends Error {
  constructor() {
    super('Platform student registration request is invalid');
    this.name = 'InvalidRegistrationError';
  }
}

export class RegistrationCityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationCityUnavailableError';
  }
}

export class PublicAcademyNotConfiguredError extends Error {
  constructor() {
    super('The public academy has not been provisioned for this city');
    this.name = 'PublicAcademyNotConfiguredError';
  }
}

/**
 * 平台学员自助注册（《07》2.5，全平台唯一自助注册通道）：
 * 手机号 + CAPTCHA + 短信验证码 → 同意协议 → 强制补齐姓名 / 性别 / 出生日期 / 注册城市
 * → 归入知行公开学院对应城市校区学院。注册信息自提交起 90 天冻结（5.2、2.5）。
 * 注册不强制设密码，凭短信验证码完成注册即签发会话。
 */
@Injectable()
export class PlatformStudentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly codes: ActivationCodeService,
    private readonly consents: ProtocolConsentService,
    private readonly identity: IdentityService,
  ) {}

  async request(input: RequestRegistrationInput) {
    const occupied = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      select: { id: true },
    });
    if (occupied) {
      throw new RegistrationPhoneOccupiedError();
    }
    return this.codes.issueRegistrationCode(input.phone, input.captchaToken);
  }

  async confirm(
    input: ConfirmRegistrationInput,
  ): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    const codeValid = await this.codes.consumeRegistrationCode(
      input.phone,
      input.code,
    );
    if (!codeValid) {
      throw new InvalidRegistrationError();
    }
    const occupied = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      select: { id: true },
    });
    if (occupied) {
      throw new RegistrationPhoneOccupiedError();
    }

    const college = await this.resolveCityCollege(input.registrationCityCode);
    const now = new Date();
    const frozenUntil = new Date(
      now.getTime() + PROFILE_FREEZE_DAYS * 24 * 60 * 60 * 1000,
    );
    const birthDate = parseBirthDate(input.birthDate);

    const accountId = await this.prisma.$transaction(async (transaction) => {
      const tenantId = college.tenantId;
      const account = await transaction.account.create({
        data: {
          kind: 'END_USER',
          phone: input.phone,
          username: null,
          displayName: input.displayName.trim(),
          gender: input.gender,
          birthDate,
          status: AccountStatus.ACTIVE,
          profileCompletedAt: now,
          membership: {
            create: { tenantId, role: MembershipRole.STUDENT },
          },
          studentProfile: {
            create: {
              tenantId,
              kind: StudentKind.PLATFORM,
              registrationCityCode: input.registrationCityCode,
              residentCityCode: input.registrationCityCode,
              profileFrozenUntil: frozenUntil,
              lastSelfEditedAt: now,
            },
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId,
          actorAccountId: account.id,
          action: 'platform_student.registered',
          targetType: 'account',
          targetId: account.id,
          after: {
            displayName: account.displayName,
            gender: account.gender,
            registrationCityCode: input.registrationCityCode,
            collegeId: college.id,
            profileFrozenUntil: frozenUntil.toISOString(),
          },
        },
      });
      return account.id;
    });

    await this.consents.recordCurrentConsents(
      accountId,
      input.consentDocumentVersionIds,
      'platform_registration',
      input.ipAddress,
    );
    return this.identity.createSessionForAccount(
      accountId,
      input.deviceSummary,
    );
  }

  /** 注册城市 → 公开学院该市校区学院；无预置或已停用一律拒绝新注册（《07》2.5） */
  private async resolveCityCollege(divisionCode: string) {
    const division = await this.prisma.administrativeDivision.findUnique({
      where: { code: divisionCode },
    });
    if (
      !division ||
      division.level !== 'PREFECTURE' ||
      !division.active
    ) {
      throw new RegistrationCityUnavailableError('注册城市不在可用字典内');
    }

    const academy = await this.prisma.tenant.findFirst({
      where: { type: TenantType.UNIVERSITY, university: { isPublicAcademy: true } },
      select: { id: true },
    });
    if (!academy) {
      throw new PublicAcademyNotConfiguredError();
    }

    const campus = await this.prisma.campus.findFirst({
      where: { tenantId: academy.id, divisionCode },
      include: {
        collegeCampuses: { include: { college: true } },
      },
    });
    if (!campus || campus.collegeCampuses.length === 0) {
      throw new PublicAcademyNotConfiguredError();
    }
    if (
      campus.status !== RecordStatus.ACTIVE ||
      campus.collegeCampuses.some((link) => link.college.status !== RecordStatus.ACTIVE)
    ) {
      throw new RegistrationCityUnavailableError(
        '该城市的公开学院校区已停用，请选择邻近已启用城市或联系运营',
      );
    }
    return campus.collegeCampuses[0]!.college;
  }
}

function parseBirthDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getTime() > Date.now()
  ) {
    throw new InvalidRegistrationError();
  }
  return date;
}
