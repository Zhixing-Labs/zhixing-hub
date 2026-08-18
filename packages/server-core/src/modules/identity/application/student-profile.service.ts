import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  Gender,
  MembershipRole,
  Prisma,
  RecordStatus,
  StudentKind,
  StudentLifecycleState,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';

const SELF_EDIT_ROLLING_DAYS = 365;

export interface CompleteFirstLoginInput {
  birthDate: string;
  politicalAffiliation?: string;
}

export interface SelfCorrectProfileInput {
  displayName?: string;
  gender?: Gender;
  birthDate?: string;
  registrationCityCode?: string;
}

export interface MyProfileView {
  accountId: string;
  displayName: string;
  gender: Gender | null;
  birthDate: string | null;
  politicalAffiliation: string | null;
  profileCompletedAt: Date | null;
  student: {
    kind: StudentKind;
    lifecycleState: StudentLifecycleState;
    registrationCityCode: string | null;
    residentCityCode: string | null;
    profileFrozenUntil: Date | null;
    lastSelfEditedAt: Date | null;
  } | null;
}

export class ProfileCompletionConflictError extends Error {
  constructor() {
    super('Profile has already been completed');
    this.name = 'ProfileCompletionConflictError';
  }
}

export class InvalidProfileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProfileInputError';
  }
}

export class ProfileFrozenError extends Error {
  constructor(retryAt: Date) {
    super(`Profile fields are frozen until ${retryAt.toISOString().slice(0, 10)}`);
    this.name = 'ProfileFrozenError';
  }
}

export class SelfEditRateLimitedError extends Error {
  constructor(retryAt: Date) {
    super(
      `Self correction is limited to once per rolling year; next allowed after ${retryAt.toISOString().slice(0, 10)}`,
    );
    this.name = 'SelfEditRateLimitedError';
  }
}

export class ResidentCityNotAllowedError extends Error {
  constructor(message = 'Current identity state cannot change resident city') {
    super(message);
    this.name = 'ResidentCityNotAllowedError';
  }
}

/**
 * 学员端本人资料（《07》5.2 首登补齐、2.5 与 5.2 的冻结与自改、4.3 常驻城市）。
 * 高校认证学员的姓名 / 性别更正走辅导员通道（StudentAdminService），不经本服务。
 */
@Injectable()
export class StudentProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async getMyProfile(): Promise<MyProfileView> {
    const account = await this.loadCurrentAccount();
    return toView(account);
  }

  /** 学生首登补齐：出生年月日必填、政治面貌选填（《07》5.2）；完成后业务门禁方可放行 */
  async completeFirstLogin(input: CompleteFirstLoginInput): Promise<MyProfileView> {
    const account = await this.loadCurrentAccount();
    if (account.profileCompletedAt) {
      throw new ProfileCompletionConflictError();
    }
    const birthDate = parseOptionalBirthDate(input.birthDate);
    if (!birthDate) {
      throw new InvalidProfileInputError('出生年月日必填且格式应为 YYYY-MM-DD');
    }
    if (
      input.politicalAffiliation !== undefined &&
      input.politicalAffiliation.trim().length > 50
    ) {
      throw new InvalidProfileInputError('政治面貌过长');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.account.update({
        where: { id: account.id },
        data: {
          birthDate,
          ...(input.politicalAffiliation !== undefined
            ? { politicalAffiliation: input.politicalAffiliation.trim() || null }
            : {}),
          profileCompletedAt: new Date(),
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: account.membership?.tenantId ?? null,
          actorAccountId: account.id,
          action: 'account.profile.first_login_completed',
          targetType: 'account',
          targetId: account.id,
          after: { birthDate: birthDate.toISOString().slice(0, 10) },
        },
      });
      return result;
    });
    return toView(updated);
  }

  /** 常驻城市：毕业生自毕业当日可改（4.3）；平台学员 90 天冻结期满后可改（2.5） */
  async updateResidentCity(divisionCode: string): Promise<MyProfileView> {
    const account = await this.loadCurrentAccount();
    const profile = account.studentProfile;
    if (!profile) {
      throw new ResidentCityNotAllowedError();
    }
    if (profile.kind === StudentKind.UNIVERSITY_CERTIFIED) {
      if (
        profile.lifecycleState !== StudentLifecycleState.GRADUATE_ACTIVE &&
        profile.lifecycleState !== StudentLifecycleState.READ_ONLY
      ) {
        throw new ResidentCityNotAllowedError(
          '常驻城市自毕业当日起方可修改',
        );
      }
    } else if (profile.profileFrozenUntil && profile.profileFrozenUntil > new Date()) {
      throw new ProfileFrozenError(profile.profileFrozenUntil);
    }
    await this.requireActivePrefecture(divisionCode);

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.studentProfile.update({
        where: { accountId: account.id },
        data: { residentCityCode: divisionCode },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: profile.tenantId,
          actorAccountId: account.id,
          action: 'student.resident_city.changed',
          targetType: 'account',
          targetId: account.id,
          before: { residentCityCode: profile.residentCityCode },
          after: { residentCityCode: divisionCode },
        },
      });
      return transaction.account.findUniqueOrThrow({
        where: { id: account.id },
        include: { membership: true, studentProfile: true },
      });
    });
    return toView(updated);
  }

  /**
   * 平台学员自改姓名 / 性别 / 出生日期 / 注册城市（《07》2.5、5.2）：
   * 90 天冻结期满后，滚动 365 天至多自助修改 1 次（不按自然年）。
   */
  async selfCorrectProfile(input: SelfCorrectProfileInput): Promise<MyProfileView> {
    const account = await this.loadCurrentAccount();
    const profile = account.studentProfile;
    if (!profile || profile.kind !== StudentKind.PLATFORM) {
      throw new InvalidProfileInputError(
        '仅平台学员可自助修改冻结资料；高校认证学员的姓名 / 性别由辅导员修改',
      );
    }
    if (
      input.displayName === undefined &&
      input.gender === undefined &&
      input.birthDate === undefined &&
      input.registrationCityCode === undefined
    ) {
      throw new InvalidProfileInputError('至少提供一个修改字段');
    }
    if (profile.profileFrozenUntil && profile.profileFrozenUntil > new Date()) {
      throw new ProfileFrozenError(profile.profileFrozenUntil);
    }
    const now = new Date();
    if (profile.lastSelfEditedAt) {
      const nextAllowed = new Date(
        profile.lastSelfEditedAt.getTime() +
          SELF_EDIT_ROLLING_DAYS * 24 * 60 * 60 * 1000,
      );
      if (nextAllowed > now) {
        throw new SelfEditRateLimitedError(nextAllowed);
      }
    }
    if (input.displayName !== undefined) {
      const trimmed = input.displayName.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        throw new InvalidProfileInputError('姓名长度须为 2–100 个字符');
      }
    }
    const birthDate = parseOptionalBirthDate(input.birthDate ?? '');
    if (input.birthDate !== undefined && !birthDate) {
      throw new InvalidProfileInputError('出生日期格式应为 YYYY-MM-DD');
    }
    if (input.registrationCityCode !== undefined) {
      await this.requireActivePrefecture(input.registrationCityCode);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.account.update({
        where: { id: account.id },
        data: {
          ...(input.displayName !== undefined
            ? { displayName: input.displayName.trim() }
            : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(birthDate ? { birthDate } : {}),
        },
        include: { membership: true, studentProfile: true },
      });
      await transaction.studentProfile.update({
        where: { accountId: account.id },
        data: {
          ...(input.registrationCityCode !== undefined
            ? {
                registrationCityCode: input.registrationCityCode,
                residentCityCode: input.registrationCityCode,
              }
            : {}),
          lastSelfEditedAt: now,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: profile.tenantId,
          actorAccountId: account.id,
          action: 'platform_student.profile.self_corrected',
          targetType: 'account',
          targetId: account.id,
          before: {
            displayName: account.displayName,
            gender: account.gender,
            registrationCityCode: profile.registrationCityCode,
          },
          after: {
            displayName: result.displayName,
            gender: result.gender,
            registrationCityCode:
              input.registrationCityCode ?? profile.registrationCityCode,
          },
        },
      });
      return transaction.account.findUniqueOrThrow({
        where: { id: account.id },
        include: { membership: true, studentProfile: true },
      });
    });
    return toView(updated);
  }

  private async requireActivePrefecture(divisionCode: string): Promise<void> {
    const division = await this.prisma.administrativeDivision.findUnique({
      where: { code: divisionCode },
      select: { level: true, active: true },
    });
    if (!division || division.level !== 'PREFECTURE' || !division.active) {
      throw new InvalidProfileInputError('城市不在可用行政区划字典内');
    }
  }

  private async loadCurrentAccount() {
    const current = this.context.requireCurrent();
    if (!current.actorAccountId) {
      throw new InvalidProfileInputError('Authentication required');
    }
    const account = await this.prisma.account.findUnique({
      where: { id: current.actorAccountId },
      include: { membership: true, studentProfile: true },
    });
    if (
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.ACTIVE ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidProfileInputError('Authentication required');
    }
    return account;
  }
}

type CurrentAccount = Prisma.AccountGetPayload<{
  include: { membership: true; studentProfile: true };
}>;

function toView(account: CurrentAccount): MyProfileView {
  const profile = account.studentProfile;
  return {
    accountId: account.id,
    displayName: account.displayName,
    gender: account.gender,
    birthDate: account.birthDate ? account.birthDate.toISOString().slice(0, 10) : null,
    politicalAffiliation: account.politicalAffiliation,
    profileCompletedAt: account.profileCompletedAt,
    student: profile
      ? {
          kind: profile.kind,
          lifecycleState: profile.lifecycleState,
          registrationCityCode: profile.registrationCityCode,
          residentCityCode: profile.residentCityCode,
          profileFrozenUntil: profile.profileFrozenUntil,
          lastSelfEditedAt: profile.lastSelfEditedAt,
        }
      : null,
  };
}

function parseOptionalBirthDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getTime() > Date.now()
  ) {
    return null;
  }
  return date;
}
