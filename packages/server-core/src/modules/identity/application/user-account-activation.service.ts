import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PasswordHasher } from '../domain/password-hasher';
import { ActivationCodeService } from './activation-code.service';
import {
  CreatedPasswordSession,
  IdentityService,
} from './identity.service';
import { ProtocolConsentService } from './protocol-consent.service';

export interface RequestUserActivationInput {
  phone: string;
  captchaToken: string;
}

export interface ConfirmUserActivationInput {
  phone: string;
  code: string;
  password: string;
  consentDocumentVersionIds: string[];
  ipAddress?: string;
  deviceSummary?: string;
}

export class InvalidUserActivationError extends Error {
  constructor() {
    super('Activation account or verification code is invalid');
    this.name = 'InvalidUserActivationError';
  }
}

@Injectable()
export class UserAccountActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: ActivationCodeService,
    private readonly passwordHasher: PasswordHasher,
    private readonly identity: IdentityService,
    private readonly consents: ProtocolConsentService,
  ) {}

  async request(input: RequestUserActivationInput) {
    const account = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      include: { membership: true },
    });
    if (
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.PENDING_ACTIVATION ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidUserActivationError();
    }
    return this.codes.issueActivationCode(
      input.phone,
      input.captchaToken,
    );
  }

  async confirm(
    input: ConfirmUserActivationInput,
  ): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    const account = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      include: { membership: true },
    });
    const codeValid = await this.codes.consumeActivationCode(
      input.phone,
      input.code,
    );
    if (
      !codeValid ||
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.PENDING_ACTIVATION ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidUserActivationError();
    }
    const membership = account.membership;

    const passwordHash = await this.passwordHasher.hash(input.password);
    const profileCompletedAt =
      membership.role === MembershipRole.STUDENT ? null : new Date();
    await this.prisma.$transaction(async (transaction) => {
      const activated = await transaction.account.updateMany({
        where: {
          id: account.id,
          status: AccountStatus.PENDING_ACTIVATION,
        },
        data: {
          passwordHash,
          status: AccountStatus.ACTIVE,
          profileCompletedAt,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      if (activated.count !== 1) {
        throw new InvalidUserActivationError();
      }
      await transaction.auditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorAccountId: account.id,
          action: 'user.account.activated',
          targetType: 'account',
          targetId: account.id,
          after: {
            role: membership.role,
            phoneBound: true,
            profileCompleted: profileCompletedAt !== null,
          },
        },
      });
    });

    await this.consents.recordCurrentConsents(
      account.id,
      input.consentDocumentVersionIds,
      'user_activation',
      input.ipAddress,
    );
    return this.identity.createSessionForAccount(
      account.id,
      input.deviceSummary,
    );
  }
}
