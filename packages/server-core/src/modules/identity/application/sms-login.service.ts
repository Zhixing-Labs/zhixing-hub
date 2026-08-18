import { Injectable } from '@nestjs/common';
import { AccountStatus, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ActivationCodeService } from './activation-code.service';
import {
  CreatedPasswordSession,
  IdentityService,
} from './identity.service';
import { ProtocolConsentService } from './protocol-consent.service';

export interface RequestSmsLoginInput {
  phone: string;
  captchaToken: string;
}

export interface ConfirmSmsLoginInput {
  phone: string;
  code: string;
  secondFactorCode?: string;
  consentDocumentVersionIds: string[];
  ipAddress?: string;
  deviceSummary?: string;
}

export class InvalidSmsLoginError extends Error {
  constructor() {
    super('SMS login account or verification code is invalid');
    this.name = 'InvalidSmsLoginError';
  }
}

@Injectable()
export class SmsLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: ActivationCodeService,
    private readonly consents: ProtocolConsentService,
    private readonly identity: IdentityService,
  ) {}

  async request(input: RequestSmsLoginInput) {
    const account = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      include: { membership: true, totpCredential: true },
    });
    if (
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.ACTIVE ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidSmsLoginError();
    }
    return {
      ...(await this.codes.issueLoginCode(input.phone, input.captchaToken)),
      secondFactorRequired: Boolean(account.totpCredential?.enabledAt),
    };
  }

  async confirm(input: ConfirmSmsLoginInput): Promise<CreatedPasswordSession> {
    await this.consents.assertCurrentDocumentIds(
      input.consentDocumentVersionIds,
    );
    const account = await this.prisma.account.findUnique({
      where: { phone: input.phone },
      include: { membership: true },
    });
    const codeValid = await this.codes.consumeLoginCode(
      input.phone,
      input.code,
    );
    if (
      !codeValid ||
      !account ||
      account.kind !== 'END_USER' ||
      account.status !== AccountStatus.ACTIVE ||
      !account.membership ||
      account.membership.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidSmsLoginError();
    }

    await this.identity.verifyUserSecondFactor(
      account.id,
      input.secondFactorCode,
    );
    await this.consents.recordCurrentConsents(
      account.id,
      input.consentDocumentVersionIds,
      'sms_login',
      input.ipAddress,
    );
    return this.identity.createSessionForAccount(
      account.id,
      input.deviceSummary,
    );
  }
}
