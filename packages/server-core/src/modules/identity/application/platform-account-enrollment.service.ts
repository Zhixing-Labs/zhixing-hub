import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { PasswordHasher } from '../domain/password-hasher';
import {
  createRecoveryCodes,
  normalizeRecoveryCode,
} from '../domain/recovery-codes';
import {
  createOpaqueSecret,
  hashSessionSecret,
} from '../domain/session-token';
import { TotpCipher } from '../domain/totp-cipher';
import { TotpService } from '../domain/totp.service';
import {
  CreatedPasswordSession,
  IdentityService,
  InvalidCredentialsError,
} from './identity.service';
import { LoginThrottleService } from './login-throttle.service';
import { ProtocolConsentService } from './protocol-consent.service';

const DEFAULT_ENROLLMENT_TTL_SECONDS = 10 * 60;
const ENROLLABLE_ROLES = new Set<MembershipRole>([
  MembershipRole.ORGANIZATION_ADMIN,
  MembershipRole.OPERATIONS_SPECIALIST,
  MembershipRole.PLATFORM_DASHBOARD,
]);

export interface StartPlatformEnrollmentInput {
  username: string;
  initialPassword: string;
}

export interface StartedPlatformEnrollment {
  enrollmentToken: string;
  totpSecret: string;
  totpUri: string;
  expiresAt: Date;
}

export interface ConfirmPlatformEnrollmentInput {
  enrollmentToken: string;
  newPassword: string;
  totpCode: string;
}

export interface ConfirmedPlatformEnrollment {
  recoveryCodesConfirmationToken: string;
  expiresAt: Date;
  recoveryCodes: string[];
}

export interface FinishPlatformEnrollmentInput {
  recoveryCodesConfirmationToken: string;
  recoveryCodesSaved: boolean;
  consentDocumentVersionIds: string[];
  ipAddress?: string;
  deviceSummary?: string;
}

export class NewPlatformPasswordMustDifferError extends Error {
  constructor() {
    super('New password must differ from the one-time initial password');
    this.name = 'NewPlatformPasswordMustDifferError';
  }
}

@Injectable()
export class PlatformAccountEnrollmentService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly totpCipher: TotpCipher,
    private readonly totp: TotpService,
    private readonly identity: IdentityService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly consents: ProtocolConsentService,
    private readonly context: RequestContextService,
  ) {
    this.dummyHash = passwordHasher.hash(
      'zhixing-invalid-platform-enrollment-sentinel',
    );
  }

  async start(
    input: StartPlatformEnrollmentInput,
  ): Promise<StartedPlatformEnrollment> {
    const account = await this.prisma.account.findUnique({
      where: { username: input.username },
      include: { membership: true },
    });
    if (!account?.passwordHash) {
      await this.passwordHasher.verify(
        await this.dummyHash,
        input.initialPassword,
      );
      throw new InvalidCredentialsError();
    }
    if (await this.loginThrottle.isLocked(account)) {
      await this.passwordHasher.verify(
        account.passwordHash,
        input.initialPassword,
      );
      throw new InvalidCredentialsError();
    }

    const passwordValid = await this.passwordHasher.verify(
      account.passwordHash,
      input.initialPassword,
    );
    if (
      !passwordValid ||
      account.kind !== 'PLATFORM_ADMIN' ||
      account.status !== AccountStatus.PENDING_ACTIVATION ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE ||
      !ENROLLABLE_ROLES.has(account.membership.role)
    ) {
      if (!passwordValid) {
        await this.loginThrottle.recordFailure(account.id);
      }
      throw new InvalidCredentialsError();
    }

    const enrollment = this.totp.createEnrollment(account.username ?? '');
    const encrypted = this.totpCipher.encrypt(account.id, enrollment.secret);
    const token = createOpaqueSecret();
    const expiresAt = new Date(
      Date.now() + readEnrollmentTtlSeconds() * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.platformAccountEnrollment.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          tokenHash: token.hash,
          expiresAt,
        },
        update: {
          tokenHash: token.hash,
          pendingPasswordHash: null,
          recoveryCodesIssuedAt: null,
          expiresAt,
          consumedAt: null,
        },
      }),
      this.prisma.totpCredential.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          secretCiphertext: Uint8Array.from(encrypted.ciphertext),
          secretIv: Uint8Array.from(encrypted.iv),
          secretAuthTag: Uint8Array.from(encrypted.authTag),
          enabledAt: null,
          lastUsedTimeStep: null,
        },
        update: {
          secretCiphertext: Uint8Array.from(encrypted.ciphertext),
          secretIv: Uint8Array.from(encrypted.iv),
          secretAuthTag: Uint8Array.from(encrypted.authTag),
          enabledAt: null,
          lastUsedTimeStep: null,
        },
      }),
      this.prisma.totpRecoveryCode.deleteMany({
        where: { accountId: account.id },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: account.membership.tenantId,
          actorAccountId: account.id,
          action: 'platform.account.enrollment_started',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
          after: { expiresAt: expiresAt.toISOString(), phoneBound: false },
        },
      }),
    ]);
    await this.loginThrottle.clear(account.id);

    return {
      enrollmentToken: token.secret,
      totpSecret: enrollment.secret,
      totpUri: enrollment.uri,
      expiresAt,
    };
  }

  async confirm(
    input: ConfirmPlatformEnrollmentInput,
  ): Promise<ConfirmedPlatformEnrollment> {
    const enrollmentTokenHash = hashSessionSecret(input.enrollmentToken);
    const enrollment = await this.prisma.platformAccountEnrollment.findUnique({
      where: { tokenHash: enrollmentTokenHash },
      include: {
        account: {
          include: {
            membership: true,
            totpCredential: true,
          },
        },
      },
    });
    const account = enrollment?.account;
    if (
      !enrollment ||
      enrollment.consumedAt ||
      enrollment.expiresAt <= new Date() ||
      enrollment.pendingPasswordHash ||
      !account?.passwordHash ||
      account.kind !== 'PLATFORM_ADMIN' ||
      account.status !== AccountStatus.PENDING_ACTIVATION ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE ||
      !ENROLLABLE_ROLES.has(account.membership.role) ||
      !account.totpCredential
    ) {
      throw new InvalidCredentialsError();
    }
    if (await this.loginThrottle.isLocked(account)) {
      throw new InvalidCredentialsError();
    }
    const membership = account.membership!;
    if (
      await this.passwordHasher.verify(
        account.passwordHash,
        input.newPassword,
      )
    ) {
      throw new NewPlatformPasswordMustDifferError();
    }

    const secret = this.totpCipher.decrypt(account.id, {
      ciphertext: Buffer.from(
        account.totpCredential.secretCiphertext,
      ),
      iv: Buffer.from(account.totpCredential.secretIv),
      authTag: Buffer.from(account.totpCredential.secretAuthTag),
    });
    const timeStep = await this.totp.verify(secret, input.totpCode);
    if (timeStep === null) {
      await this.loginThrottle.recordFailure(account.id);
      throw new InvalidCredentialsError();
    }

    const pendingPasswordHash = await this.passwordHasher.hash(
      input.newPassword,
    );
    const recoveryCodes = createRecoveryCodes();
    const recoveryCodeHashes: string[] = [];
    for (const recoveryCode of recoveryCodes) {
      recoveryCodeHashes.push(
        await this.passwordHasher.hash(normalizeRecoveryCode(recoveryCode)),
      );
    }
    const confirmationToken = createOpaqueSecret();
    const expiresAt = new Date(
      Date.now() + readEnrollmentTtlSeconds() * 1000,
    );

    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.platformAccountEnrollment.updateMany({
        where: {
          id: enrollment.id,
          tokenHash: enrollmentTokenHash,
          pendingPasswordHash: null,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          tokenHash: confirmationToken.hash,
          pendingPasswordHash,
          recoveryCodesIssuedAt: new Date(),
          expiresAt,
        },
      });
      if (claimed.count !== 1) {
        throw new InvalidCredentialsError();
      }

      await transaction.totpCredential.update({
        where: { accountId: account.id },
        data: {
          enabledAt: new Date(),
          lastUsedTimeStep: timeStep,
        },
      });
      await transaction.totpRecoveryCode.deleteMany({
        where: { accountId: account.id },
      });
      await transaction.totpRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({
          accountId: account.id,
          codeHash,
        })),
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorAccountId: account.id,
          action: 'platform.account.activation_security_configured',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
          after: {
            role: membership.role,
            phoneBound: false,
            totpEnabled: true,
            passwordChangePrepared: true,
            recoveryCodeCount: recoveryCodes.length,
          },
        },
      });
    });

    return {
      recoveryCodesConfirmationToken: confirmationToken.secret,
      expiresAt,
      recoveryCodes,
    };
  }

  async finish(
    input: FinishPlatformEnrollmentInput,
  ): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    if (!input.recoveryCodesSaved) {
      throw new InvalidCredentialsError();
    }

    const tokenHash = hashSessionSecret(
      input.recoveryCodesConfirmationToken,
    );
    const enrollment = await this.prisma.platformAccountEnrollment.findUnique({
      where: { tokenHash },
      include: {
        account: {
          include: {
            membership: true,
            totpCredential: true,
          },
        },
      },
    });
    const account = enrollment?.account;
    if (
      !enrollment ||
      enrollment.consumedAt ||
      enrollment.expiresAt <= new Date() ||
      !enrollment.pendingPasswordHash ||
      !enrollment.recoveryCodesIssuedAt ||
      account?.kind !== 'PLATFORM_ADMIN' ||
      account.status !== AccountStatus.PENDING_ACTIVATION ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE ||
      !ENROLLABLE_ROLES.has(account.membership.role) ||
      !account.totpCredential?.enabledAt
    ) {
      throw new InvalidCredentialsError();
    }

    const pendingPasswordHash = enrollment.pendingPasswordHash;
    const membership = account.membership!;
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.platformAccountEnrollment.updateMany({
        where: {
          id: enrollment.id,
          tokenHash,
          pendingPasswordHash,
          recoveryCodesIssuedAt: { not: null },
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          pendingPasswordHash: null,
          consumedAt: new Date(),
        },
      });
      if (consumed.count !== 1) {
        throw new InvalidCredentialsError();
      }

      await transaction.account.update({
        where: {
          id: account.id,
          status: AccountStatus.PENDING_ACTIVATION,
        },
        data: {
          passwordHash: pendingPasswordHash,
          status: AccountStatus.ACTIVE,
          profileCompletedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorAccountId: account.id,
          action: 'platform.account.activated',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
          after: {
            role: membership.role,
            phoneBound: false,
            totpEnabled: true,
            passwordChanged: true,
            recoveryCodesSavedConfirmed: true,
          },
        },
      });
    });

    await this.loginThrottle.clear(account.id);
    await this.consents.recordCurrentConsents(
      account.id,
      input.consentDocumentVersionIds,
      'platform_activation',
      input.ipAddress,
    );
    return this.identity.createSessionForAccount(
      account.id,
      input.deviceSummary,
    );
  }
}

function readEnrollmentTtlSeconds(): number {
  const value = Number(
    process.env.PLATFORM_ENROLLMENT_TTL_SECONDS ??
      DEFAULT_ENROLLMENT_TTL_SECONDS,
  );
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_ENROLLMENT_TTL_SECONDS;
}
