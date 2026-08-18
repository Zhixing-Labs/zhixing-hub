import { Injectable } from '@nestjs/common';
import {
  AccountKind,
  AccountStatus,
  MembershipRole,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PasswordHasher } from '../domain/password-hasher';
import { normalizeRecoveryCode } from '../domain/recovery-codes';
import {
  createSessionSecrets,
  hashSessionSecret,
} from '../domain/session-token';
import { TotpCipher } from '../domain/totp-cipher';
import { TotpService } from '../domain/totp.service';
import { LoginThrottleService } from './login-throttle.service';
import { ProtocolConsentService } from './protocol-consent.service';

const DEFAULT_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const PLATFORM_ROLES = new Set<MembershipRole>([
  MembershipRole.SUPER_ADMIN,
  MembershipRole.ORGANIZATION_ADMIN,
  MembershipRole.OPERATIONS_SPECIALIST,
  MembershipRole.PLATFORM_DASHBOARD,
]);

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class SecondFactorRequiredError extends Error {
  constructor() {
    super('A TOTP or recovery code is required');
    this.name = 'SecondFactorRequiredError';
  }
}

export interface CreateUserPasswordSessionInput {
  phone: string;
  password: string;
  secondFactorCode?: string;
  consentDocumentVersionIds: string[];
  ipAddress?: string;
  deviceSummary?: string;
}

export interface CreatePlatformSessionInput {
  username: string;
  password: string;
  secondFactorCode: string;
  consentDocumentVersionIds: string[];
  ipAddress?: string;
  deviceSummary?: string;
}

export interface CreatedPasswordSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  account: AuthenticatedAccount;
}

export interface AuthenticatedAccount {
  accountId: string;
  displayName: string;
  kind: AccountKind;
  tenantId: string;
  role: MembershipRole;
}

@Injectable()
export class IdentityService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly totpCipher: TotpCipher,
    private readonly totp: TotpService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly consents: ProtocolConsentService,
  ) {
    // 未命中账号时仍执行一次 Argon2id，降低账号枚举的时序差异。
    this.dummyHash = passwordHasher.hash('zhixing-invalid-credential-sentinel');
  }

  async createUserPasswordSession(
    input: CreateUserPasswordSessionInput,
  ): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    const account = await this.prisma.account.findUnique({
      where: {
        phone: input.phone,
      },
      include: {
        membership: true,
        totpCredential: true,
        totpRecoveryCodes: {
          where: { consumedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (
      !(await this.verifyPassword(account, input.password)) ||
      account?.status !== AccountStatus.ACTIVE ||
      account?.kind !== AccountKind.END_USER
    ) {
      throw new InvalidCredentialsError();
    }
    await this.verifySecondFactorIfEnabled(account, input.secondFactorCode);

    await this.consents.recordCurrentConsents(
      account.id,
      input.consentDocumentVersionIds,
      'password_login',
      input.ipAddress,
    );
    return this.persistSession(account, input.deviceSummary);
  }

  async verifyUserSecondFactor(
    accountId: string,
    secondFactorCode?: string,
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        totpCredential: true,
        totpRecoveryCodes: {
          where: { consumedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!account || account.kind !== AccountKind.END_USER) {
      throw new InvalidCredentialsError();
    }
    await this.verifySecondFactorIfEnabled(account, secondFactorCode);
  }

  async verifyActivePassword(
    accountId: string,
    password: string,
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (
      !(await this.verifyPassword(account, password)) ||
      account?.status !== AccountStatus.ACTIVE
    ) {
      throw new InvalidCredentialsError();
    }
  }

  async createPlatformSession(
    input: CreatePlatformSessionInput,
  ): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    const account = await this.prisma.account.findUnique({
      where: { username: input.username },
      include: {
        membership: true,
        totpCredential: true,
        totpRecoveryCodes: {
          where: { consumedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (
      !(await this.verifyPassword(account, input.password)) ||
      account?.status !== AccountStatus.ACTIVE ||
      account?.kind !== AccountKind.PLATFORM_ADMIN ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE ||
      !PLATFORM_ROLES.has(account.membership.role) ||
      !account.totpCredential?.enabledAt
    ) {
      throw new InvalidCredentialsError();
    }

    const secondFactorValid = /^\d{6}$/.test(input.secondFactorCode)
      ? await this.consumeTotp(
          account.id,
          account.totpCredential,
          input.secondFactorCode,
        )
      : await this.consumeRecoveryCode(
          account.id,
          account.totpRecoveryCodes,
          input.secondFactorCode,
        );
    if (!secondFactorValid) {
      await this.loginThrottle.recordFailure(account.id);
      throw new InvalidCredentialsError();
    }

    await this.consents.recordCurrentConsents(
      account.id,
      input.consentDocumentVersionIds,
      'platform_login',
      input.ipAddress,
    );
    return this.persistSession(account, input.deviceSummary);
  }

  private async verifyPassword(
    account: {
      id: string;
      passwordHash: string | null;
      failedLoginCount: number;
      lockedUntil: Date | null;
    } | null,
    password: string,
  ): Promise<boolean> {
    if (!account?.passwordHash) {
      await this.passwordHasher.verify(await this.dummyHash, password);
      return false;
    }

    if (await this.loginThrottle.isLocked(account)) {
      await this.passwordHasher.verify(account.passwordHash, password);
      return false;
    }

    const valid = await this.passwordHasher.verify(
      account.passwordHash,
      password,
    );
    if (!valid) {
      await this.loginThrottle.recordFailure(account.id);
    }
    return valid;
  }

  private async consumeTotp(
    accountId: string,
    credential: {
      secretCiphertext: Uint8Array;
      secretIv: Uint8Array;
      secretAuthTag: Uint8Array;
      lastUsedTimeStep: number | null;
    },
    token: string,
  ): Promise<boolean> {
    const secret = this.totpCipher.decrypt(accountId, {
      ciphertext: Buffer.from(credential.secretCiphertext),
      iv: Buffer.from(credential.secretIv),
      authTag: Buffer.from(credential.secretAuthTag),
    });
    const timeStep = await this.totp.verify(
      secret,
      token,
      credential.lastUsedTimeStep ?? undefined,
    );
    if (timeStep === null) {
      return false;
    }

    const updated = await this.prisma.totpCredential.updateMany({
      where: {
        accountId,
        lastUsedTimeStep: credential.lastUsedTimeStep,
      },
      data: { lastUsedTimeStep: timeStep },
    });
    return updated.count === 1;
  }

  private async consumeRecoveryCode(
    accountId: string,
    recoveryCodes: Array<{
      id: string;
      codeHash: string;
    }>,
    candidate: string,
  ): Promise<boolean> {
    const normalized = normalizeRecoveryCode(candidate);
    if (!/^[A-Z0-9]{12}$/.test(normalized)) {
      return false;
    }

    for (const recoveryCode of recoveryCodes) {
      if (
        await this.passwordHasher.verify(recoveryCode.codeHash, normalized)
      ) {
        const updated = await this.prisma.totpRecoveryCode.updateMany({
          where: {
            id: recoveryCode.id,
            accountId,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
        return updated.count === 1;
      }
    }
    return false;
  }

  private async verifySecondFactorIfEnabled(
    account: {
      id: string;
      totpCredential: {
        secretCiphertext: Uint8Array;
        secretIv: Uint8Array;
        secretAuthTag: Uint8Array;
        lastUsedTimeStep: number | null;
        enabledAt: Date | null;
      } | null;
      totpRecoveryCodes: Array<{ id: string; codeHash: string }>;
    },
    secondFactorCode?: string,
  ): Promise<void> {
    if (!account.totpCredential?.enabledAt) {
      return;
    }
    if (!secondFactorCode) {
      throw new SecondFactorRequiredError();
    }

    const valid = /^\d{6}$/.test(secondFactorCode)
      ? await this.consumeTotp(
          account.id,
          account.totpCredential,
          secondFactorCode,
        )
      : await this.consumeRecoveryCode(
          account.id,
          account.totpRecoveryCodes,
          secondFactorCode,
        );
    if (!valid) {
      await this.loginThrottle.recordFailure(account.id);
      throw new InvalidCredentialsError();
    }
  }

  private async persistSession(
    account: {
      id: string;
      displayName: string;
      kind: AccountKind;
      membership: {
        tenantId: string;
        role: MembershipRole;
        status: RecordStatus;
      } | null;
    },
    deviceSummary?: string,
  ): Promise<CreatedPasswordSession> {
    if (
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidCredentialsError();
    }

    await this.loginThrottle.clear(account.id);
    const ttlSeconds = readSessionTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const secrets = createSessionSecrets();

    await this.prisma.$transaction([
      this.prisma.authSession.create({
        data: {
          accountId: account.id,
          tokenHash: secrets.tokenHash,
          csrfTokenHash: secrets.csrfTokenHash,
          deviceSummary: deviceSummary?.slice(0, 255),
          expiresAt,
        },
      }),
      this.prisma.account.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      token: secrets.token,
      csrfToken: secrets.csrfToken,
      expiresAt,
      account: {
        accountId: account.id,
        displayName: account.displayName,
        kind: account.kind,
        tenantId: account.membership.tenantId,
        role: account.membership.role,
      },
    };
  }

  async createSessionForAccount(
    accountId: string,
    deviceSummary?: string,
  ): Promise<CreatedPasswordSession> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { membership: true },
    });
    if (!account || account.status !== AccountStatus.ACTIVE) {
      throw new InvalidCredentialsError();
    }
    return this.persistSession(account, deviceSummary);
  }

  async resolveSession(token: string): Promise<AuthenticatedAccount | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionSecret(token) },
      include: {
        account: {
          include: { membership: true },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.account.status !== AccountStatus.ACTIVE ||
      !session.account.membership ||
      session.account.membership.status !== RecordStatus.ACTIVE
    ) {
      return null;
    }
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (session.lastUsedAt < fiveMinutesAgo) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      accountId: session.account.id,
      displayName: session.account.displayName,
      kind: session.account.kind,
      tenantId: session.account.membership.tenantId,
      role: session.account.membership.role,
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        tokenHash: hashSessionSecret(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async validateCsrfToken(token: string, csrfToken: string): Promise<boolean> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionSecret(token) },
      select: {
        csrfTokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    return Boolean(
      session &&
        !session.revokedAt &&
        session.expiresAt > new Date() &&
        session.csrfTokenHash === hashSessionSecret(csrfToken),
    );
  }
}

function readSessionTtlSeconds(): number {
  const value = Number(
    process.env.SESSION_TTL_SECONDS ?? DEFAULT_SESSION_TTL_SECONDS,
  );
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_SESSION_TTL_SECONDS;
}
