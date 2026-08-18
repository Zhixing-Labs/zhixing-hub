import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  PhoneChangeStatus,
  Prisma,
  RecordStatus,
  StudentKind,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { ActivationCodeService } from './activation-code.service';

const OLD_PHONE_VERIFIED_TTL_SECONDS = 10 * 60;

export interface RequestOldVerificationInput {
  captchaToken: string;
}

export interface RequestNewVerificationInput {
  oldPhoneCode: string;
  newPhone: string;
  captchaToken: string;
}

export interface ConfirmSelfInput {
  newPhoneCode: string;
}

export interface CounselorInitiateInput {
  studentAccountId: string;
  newPhone: string;
  captchaToken: string;
}

export interface CounselorVerifyInput {
  requestId: string;
  code: string;
}

export interface CounselorResolveInput {
  requestId: string;
  approve: boolean;
}

export interface PendingPhoneChangeView {
  requestId: string;
  studentAccountId: string;
  studentNumber: string;
  displayName: string;
  currentPhone: string | null;
  newPhone: string;
  createdAt: Date;
  pendingDays: number;
}

export class PhoneChangeInvalidError extends Error {
  constructor(message = 'Phone change verification failed') {
    super(message);
    this.name = 'PhoneChangeInvalidError';
  }
}

export class PhoneChangeTargetOccupiedError extends Error {
  constructor() {
    super('The new phone number is already in use by another account');
    this.name = 'PhoneChangeTargetOccupiedError';
  }
}

export class CounselorPhoneChangeDeniedError extends Error {
  constructor(message = 'Only the counselor of this student can manage phone changes') {
    super(message);
    this.name = 'CounselorPhoneChangeDeniedError';
  }
}

export class PhoneChangeRequestNotFoundError extends Error {
  constructor() {
    super('Phone change request was not found in the current scope');
    this.name = 'PhoneChangeRequestNotFoundError';
  }
}

/**
 * 手机号换绑（《07》5.6）。在用账户换绑 = 本人登录 + 旧号短信验证 + 新号短信验证
 * 三因素；高校认证学员换绑另须辅导员确认（通过 / 驳回，不进审核队列、不自动通过）；
 * 旧号丢失时由辅导员核实身份后代发起（新号短信验证后直接生效）。
 * 生效即释放旧号（全平台唯一约束不变）；平台学员与毕业态不提供客服找回。
 */
@Injectable()
export class PhoneChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly redis: RedisService,
    private readonly codes: ActivationCodeService,
  ) {}

  /** 第一步：向当前（旧）手机号发送验证码 */
  async requestOldVerification(input: RequestOldVerificationInput) {
    const account = await this.loadCurrentEndUser();
    if (!account.phone) {
      throw new PhoneChangeInvalidError('Current account has no bound phone');
    }
    return this.codes.issuePhoneChangeOldCode(
      account.phone,
      input.captchaToken,
    );
  }

  /** 第二步：核验旧号验证码通过后，向新手机号发送验证码 */
  async requestNewVerification(input: RequestNewVerificationInput) {
    const account = await this.loadCurrentEndUser();
    if (!account.phone) {
      throw new PhoneChangeInvalidError('Current account has no bound phone');
    }
    const oldVerified = await this.codes.consumePhoneChangeOldCode(
      account.phone,
      input.oldPhoneCode,
    );
    if (!oldVerified) {
      throw new PhoneChangeInvalidError('Old phone verification code is wrong');
    }
    if (!/^1[3-9]\d{9}$/.test(input.newPhone)) {
      throw new PhoneChangeInvalidError('New phone format is invalid');
    }
    if (input.newPhone === account.phone) {
      throw new PhoneChangeInvalidError('New phone must differ from the current one');
    }
    await this.assertPhoneAvailable(input.newPhone);

    const redis = await this.redis.connection();
    await redis.set(
      oldVerifiedKey(account.id),
      input.newPhone,
      'EX',
      OLD_PHONE_VERIFIED_TTL_SECONDS,
    );
    return this.codes.issuePhoneChangeNewCode(
      input.newPhone,
      input.captchaToken,
    );
  }

  /** 第三步：核验新号验证码；高校认证学员转入辅导员确认，其余直接生效 */
  async confirmSelf(input: ConfirmSelfInput) {
    const account = await this.loadCurrentEndUser();
    const redis = await this.redis.connection();

    // 辅导员代发起的在途件优先：学生本人核验新号验证码后直接生效
    const counselorInitiated = await this.prisma.phoneChangeRequest.findFirst({
      where: { accountId: account.id, status: PhoneChangeStatus.PENDING_SMS },
      orderBy: { createdAt: 'desc' },
    });
    if (counselorInitiated) {
      const verified = await this.codes.consumePhoneChangeNewCode(
        counselorInitiated.newPhone,
        input.newPhoneCode,
      );
      if (!verified) {
        throw new PhoneChangeInvalidError();
      }
      await this.applyPhoneChange(
        counselorInitiated.id,
        account.id,
        counselorInitiated.newPhone,
      );
      await redis.del(oldVerifiedKey(account.id));
      return { applied: true as const, requiresCounselorConfirmation: false };
    }

    // 标记位存旧号验证通过后登记的新号
    const pendingNewPhone = await redis.get(oldVerifiedKey(account.id));
    if (!pendingNewPhone) {
      throw new PhoneChangeInvalidError(
        'Old phone verification has expired; restart the flow',
      );
    }
    const verified = await this.codes.consumePhoneChangeNewCode(
      pendingNewPhone,
      input.newPhoneCode,
    );
    if (!verified) {
      throw new PhoneChangeInvalidError();
    }

    const isCertifiedStudent =
      account.membership?.role === MembershipRole.STUDENT &&
      account.studentProfile?.kind === StudentKind.UNIVERSITY_CERTIFIED;
    const request = await this.prisma.phoneChangeRequest.create({
      data: {
        accountId: account.id,
        newPhone: pendingNewPhone,
        initiatedBy: 'SELF',
        status: isCertifiedStudent
          ? PhoneChangeStatus.PENDING_CONFIRM
          : PhoneChangeStatus.APPLIED,
        verifiedNewPhoneAt: new Date(),
        ...(isCertifiedStudent ? {} : { resolvedAt: new Date() }),
      },
    });
    if (!isCertifiedStudent) {
      await this.applyPhoneChange(request.id, account.id, pendingNewPhone);
      await redis.del(oldVerifiedKey(account.id));
      return { applied: true as const, requiresCounselorConfirmation: false };
    }
    await redis.del(oldVerifiedKey(account.id));
    return { applied: false as const, requiresCounselorConfirmation: true };
  }

  /** 辅导员代发起（旧号丢失救济）：登记在途件并向新号发送验证码 */
  async counselorInitiate(input: CounselorInitiateInput) {
    const counselor = await this.requireCounselor();
    const student = await this.loadCertifiedStudentOfCounselor(
      counselor,
      input.studentAccountId,
    );
    if (!/^1[3-9]\d{9}$/.test(input.newPhone)) {
      throw new PhoneChangeInvalidError('New phone format is invalid');
    }
    if (input.newPhone === student.phone) {
      throw new PhoneChangeInvalidError('New phone must differ from the current one');
    }
    await this.assertPhoneAvailable(input.newPhone);

    await this.prisma.phoneChangeRequest.create({
      data: {
        accountId: student.id,
        newPhone: input.newPhone,
        initiatedBy: 'COUNSELOR',
        status: PhoneChangeStatus.PENDING_SMS,
      },
    });
    await this.writeAudit(
      counselor,
      'student.phone_change.initiated_by_counselor',
      student.id,
      { newPhone: input.newPhone },
    );
    return this.codes.issuePhoneChangeNewCode(
      input.newPhone,
      input.captchaToken,
    );
  }

  /** 辅导员代发起的第二步：核验学生新号验证码，直接生效 */
  async counselorVerify(input: CounselorVerifyInput) {
    const counselor = await this.requireCounselor();
    const request = await this.loadScopedRequest(counselor, input.requestId);
    if (request.status !== PhoneChangeStatus.PENDING_SMS) {
      throw new PhoneChangeRequestNotFoundError();
    }
    const verified = await this.codes.consumePhoneChangeNewCode(
      request.newPhone,
      input.code,
    );
    if (!verified) {
      throw new PhoneChangeInvalidError();
    }
    await this.applyPhoneChange(request.id, request.accountId, request.newPhone);
  }

  /** 辅导员确认通道：自助发起的换绑（PENDING_CONFIRM）通过 / 驳回 */
  async counselorResolve(input: CounselorResolveInput) {
    const counselor = await this.requireCounselor();
    const request = await this.loadScopedRequest(counselor, input.requestId);
    if (request.status !== PhoneChangeStatus.PENDING_CONFIRM) {
      throw new PhoneChangeRequestNotFoundError();
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.phoneChangeRequest.update({
        where: { id: request.id },
        data: {
          status: input.approve
            ? PhoneChangeStatus.APPLIED
            : PhoneChangeStatus.REJECTED,
          resolvedAt: new Date(),
          resolvedByAccountId: counselor.accountId,
        },
      });
      if (input.approve) {
        await transaction.account.update({
          where: { id: request.accountId },
          data: { phone: request.newPhone },
        });
      }
      await transaction.auditEvent.create({
        data: {
          tenantId: counselor.tenantId,
          actorAccountId: counselor.accountId,
          action: input.approve
            ? 'student.phone_change.approved'
            : 'student.phone_change.rejected',
          targetType: 'account',
          targetId: request.accountId,
          requestId: counselor.requestId,
          before: { phone: request.account.phone },
          after: { phone: input.approve ? request.newPhone : request.account.phone },
        },
      });
    });
  }

  /** 辅导员待确认清单（自助发起的在途换绑，展示逾期天数、不自动通过） */
  async listPendingForCounselor(): Promise<PendingPhoneChangeView[]> {
    const counselor = await this.requireCounselor();
    const requests = await this.prisma.phoneChangeRequest.findMany({
      where: {
        status: PhoneChangeStatus.PENDING_CONFIRM,
        account: {
          kind: 'END_USER',
          membership: { tenantId: counselor.tenantId, role: MembershipRole.STUDENT },
          studentProfile: {
            cohortClass: { counselorMembershipId: counselor.membershipId },
          },
        },
      },
      include: {
        account: {
          include: {
            membership: true,
            studentProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const now = Date.now();
    return requests.map((request) => ({
      requestId: request.id,
      studentAccountId: request.accountId,
      studentNumber: request.account.studentProfile?.studentNumber ?? '',
      displayName: request.account.displayName,
      currentPhone: request.account.phone,
      newPhone: request.newPhone,
      createdAt: request.createdAt,
      pendingDays: Math.floor(
        (now - request.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      ),
    }));
  }

  private async applyPhoneChange(
    requestId: string,
    accountId: string,
    newPhone: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const accountBefore = await transaction.account.findUniqueOrThrow({
        where: { id: accountId },
        include: { membership: true },
      });
      await transaction.phoneChangeRequest.update({
        where: { id: requestId },
        data: {
          status: PhoneChangeStatus.APPLIED,
          verifiedNewPhoneAt: new Date(),
          resolvedAt: new Date(),
        },
      });
      await transaction.account.update({
        where: { id: accountId },
        data: { phone: newPhone },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: accountBefore.membership?.tenantId ?? null,
          actorAccountId: accountId,
          action: 'account.phone.changed',
          targetType: 'account',
          targetId: accountId,
          before: { phone: accountBefore.phone },
          after: { phone: newPhone },
        },
      });
    });
  }

  private async assertPhoneAvailable(newPhone: string): Promise<void> {
    const occupied = await this.prisma.account.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (occupied) {
      throw new PhoneChangeTargetOccupiedError();
    }
  }

  private async loadCurrentEndAccount() {
    const current = this.context.requireCurrent();
    if (!current.actorAccountId) {
      throw new PhoneChangeInvalidError('Authentication required');
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
      throw new PhoneChangeInvalidError('Authentication required');
    }
    return account;
  }

  private loadCurrentEndUser() {
    return this.loadCurrentEndAccount();
  }

  private async loadScopedRequest(counselor: CounselorActor, requestId: string) {
    const request = await this.prisma.phoneChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        account: {
          include: {
            membership: true,
            studentProfile: { include: { cohortClass: { include: { major: true } } } },
          },
        },
      },
    });
    const profile = request?.account.studentProfile;
    if (
      !request ||
      request.account.membership?.tenantId !== counselor.tenantId ||
      request.account.membership.role !== MembershipRole.STUDENT ||
      profile?.kind !== StudentKind.UNIVERSITY_CERTIFIED ||
      profile.cohortClass?.counselorMembershipId !== counselor.membershipId
    ) {
      throw new PhoneChangeRequestNotFoundError();
    }
    return request;
  }

  private async loadCertifiedStudentOfCounselor(
    counselor: CounselorActor,
    accountId: string,
  ) {
    const student = await this.prisma.account.findFirst({
      where: { id: accountId, kind: 'END_USER' },
      include: {
        membership: true,
        studentProfile: { include: { cohortClass: true } },
      },
    });
    if (
      !student ||
      student.membership?.tenantId !== counselor.tenantId ||
      student.membership.role !== MembershipRole.STUDENT ||
      student.studentProfile?.kind !== StudentKind.UNIVERSITY_CERTIFIED ||
      student.studentProfile.cohortClass?.counselorMembershipId !==
        counselor.membershipId
    ) {
      throw new CounselorPhoneChangeDeniedError();
    }
    return student;
  }

  private async requireCounselor(): Promise<CounselorActor> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.COUNSELOR
    ) {
      throw new CounselorPhoneChangeDeniedError();
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
      throw new CounselorPhoneChangeDeniedError();
    }
    return {
      accountId: membership.accountId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      requestId: current.requestId,
    };
  }

  private async writeAudit(
    counselor: CounselorActor,
    action: string,
    targetAccountId: string,
    after: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: counselor.tenantId,
        actorAccountId: counselor.accountId,
        action,
        targetType: 'account',
        targetId: targetAccountId,
        requestId: counselor.requestId,
        after,
      },
    });
  }
}

interface CounselorActor {
  accountId: string;
  membershipId: string;
  tenantId: string;
  requestId: string;
}

function oldVerifiedKey(accountId: string): string {
  return `identity:phone-change:old-verified:${accountId}`;
}
