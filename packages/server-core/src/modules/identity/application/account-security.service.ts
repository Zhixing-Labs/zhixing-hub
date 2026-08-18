import { Injectable } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { PasswordHasher } from '../domain/password-hasher';
import {
  createRecoveryCodes,
  normalizeRecoveryCode,
} from '../domain/recovery-codes';
import { TotpCipher } from '../domain/totp-cipher';
import { TotpService } from '../domain/totp.service';
import {
  IdentityService,
  InvalidCredentialsError,
} from './identity.service';

export class OrdinaryAccountRequiredError extends Error {
  constructor() {
    super('This security operation is only available to ordinary accounts');
    this.name = 'OrdinaryAccountRequiredError';
  }
}

export class TotpAlreadyEnabledError extends Error {
  constructor() {
    super('TOTP is already enabled');
    this.name = 'TotpAlreadyEnabledError';
  }
}

export class TotpNotEnabledError extends Error {
  constructor() {
    super('TOTP is not enabled');
    this.name = 'TotpNotEnabledError';
  }
}

export class NewPasswordMustDifferError extends Error {
  constructor() {
    super('New password must differ from the current password');
    this.name = 'NewPasswordMustDifferError';
  }
}

@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly passwordHasher: PasswordHasher,
    private readonly totpCipher: TotpCipher,
    private readonly totp: TotpService,
    private readonly identity: IdentityService,
  ) {}

  async startTotpEnrollment(password: string) {
    const account = await this.requireOrdinaryAccount();
    await this.identity.verifyActivePassword(account.id, password);
    if (account.totpCredential?.enabledAt) {
      throw new TotpAlreadyEnabledError();
    }

    const enrollment = this.totp.createEnrollment(account.phone ?? account.id);
    const encrypted = this.totpCipher.encrypt(account.id, enrollment.secret);
    await this.prisma.$transaction([
      this.prisma.totpCredential.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          secretCiphertext: Uint8Array.from(encrypted.ciphertext),
          secretIv: Uint8Array.from(encrypted.iv),
          secretAuthTag: Uint8Array.from(encrypted.authTag),
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
          tenantId: account.membership!.tenantId,
          actorAccountId: account.id,
          action: 'user.totp.enrollment_started',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
        },
      }),
    ]);
    return { secret: enrollment.secret, uri: enrollment.uri };
  }

  async confirmTotpEnrollment(token: string): Promise<string[]> {
    const account = await this.requireOrdinaryAccount();
    const credential = account.totpCredential;
    if (!credential || credential.enabledAt) {
      throw credential?.enabledAt
        ? new TotpAlreadyEnabledError()
        : new TotpNotEnabledError();
    }

    const secret = this.totpCipher.decrypt(account.id, {
      ciphertext: Buffer.from(credential.secretCiphertext),
      iv: Buffer.from(credential.secretIv),
      authTag: Buffer.from(credential.secretAuthTag),
    });
    const timeStep = await this.totp.verify(secret, token);
    if (timeStep === null) {
      throw new InvalidCredentialsError();
    }

    const recoveryCodes = createRecoveryCodes();
    const hashes: string[] = [];
    for (const code of recoveryCodes) {
      hashes.push(
        await this.passwordHasher.hash(normalizeRecoveryCode(code)),
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      const enabled = await transaction.totpCredential.updateMany({
        where: { accountId: account.id, enabledAt: null },
        data: { enabledAt: new Date(), lastUsedTimeStep: timeStep },
      });
      if (enabled.count !== 1) {
        throw new InvalidCredentialsError();
      }
      await transaction.totpRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({
          accountId: account.id,
          codeHash,
        })),
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: account.membership!.tenantId,
          actorAccountId: account.id,
          action: 'user.totp.enabled',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
          after: { recoveryCodeCount: recoveryCodes.length },
        },
      });
    });
    return recoveryCodes;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    secondFactorCode?: string,
  ): Promise<void> {
    const account = await this.requireOrdinaryAccount();
    await this.identity.verifyActivePassword(account.id, currentPassword);
    await this.identity.verifyUserSecondFactor(
      account.id,
      secondFactorCode,
    );
    if (await this.passwordHasher.verify(account.passwordHash!, newPassword)) {
      throw new NewPasswordMustDifferError();
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: account.id },
        data: { passwordHash },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: account.membership!.tenantId,
          actorAccountId: account.id,
          action: 'user.password.changed',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
        },
      }),
    ]);
  }

  async disableTotp(
    password: string,
    secondFactorCode: string,
  ): Promise<void> {
    const account = await this.requireOrdinaryAccount();
    if (!account.totpCredential?.enabledAt) {
      throw new TotpNotEnabledError();
    }
    await this.identity.verifyActivePassword(account.id, password);
    await this.identity.verifyUserSecondFactor(
      account.id,
      secondFactorCode,
    );

    await this.prisma.$transaction([
      this.prisma.totpRecoveryCode.deleteMany({
        where: { accountId: account.id },
      }),
      this.prisma.totpCredential.delete({
        where: { accountId: account.id },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: account.membership!.tenantId,
          actorAccountId: account.id,
          action: 'user.totp.disabled',
          targetType: 'account',
          targetId: account.id,
          requestId: this.context.requireCurrent().requestId,
        },
      }),
    ]);
  }

  private async requireOrdinaryAccount() {
    const current = this.context.requireCurrent();
    if (!current.actorAccountId) {
      throw new OrdinaryAccountRequiredError();
    }
    const account = await this.prisma.account.findUnique({
      where: { id: current.actorAccountId },
      include: {
        membership: true,
        totpCredential: true,
      },
    });
    if (
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.ACTIVE ||
      !account.membership ||
      !account.passwordHash
    ) {
      throw new OrdinaryAccountRequiredError();
    }
    return account;
  }
}
