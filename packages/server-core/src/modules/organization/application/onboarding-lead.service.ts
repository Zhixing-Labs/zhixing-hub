import { Inject, Injectable } from '@nestjs/common';
import {
  MembershipRole,
  OnboardingLeadKind,
  OnboardingLeadStatus,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import {
  CAPTCHA_ADAPTER,
  CaptchaAdapter,
} from '../../integration/integration.adapters';
import { InvalidCaptchaError } from '../../identity/application/activation-code.service';
import { OrganizationAdministrationDeniedError } from './organization-admin.service';

export interface SubmitOnboardingLeadInput {
  kind: OnboardingLeadKind;
  institutionName: string;
  contactName: string;
  contactMethod: string;
  intent: string;
  captchaToken: string;
}

export interface OnboardingLeadSummary {
  id: string;
  kind: OnboardingLeadKind;
  institutionName: string;
  contactName: string;
  contactMethod: string;
  intent: string;
  status: OnboardingLeadStatus;
  createdAt: Date;
  statusChangedAt: Date | null;
}

export class OnboardingLeadNotFoundError extends Error {
  constructor() {
    super('Onboarding lead was not found');
    this.name = 'OnboardingLeadNotFoundError';
  }
}

/**
 * 介绍首页入驻线索（《04》4.11）：提交不开通账户、不进审核队列。
 * 组织管理员只改状态标记，租户开通仍走第 7 节。
 */
@Injectable()
export class OnboardingLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    @Inject(CAPTCHA_ADAPTER) private readonly captcha: CaptchaAdapter,
  ) {}

  async submit(input: SubmitOnboardingLeadInput): Promise<OnboardingLeadSummary> {
    if (!(await this.captcha.verify(input.captchaToken))) {
      throw new InvalidCaptchaError();
    }

    const created = await this.prisma.onboardingLead.create({
      data: {
        kind: input.kind,
        institutionName: input.institutionName.trim(),
        contactName: input.contactName.trim(),
        contactMethod: input.contactMethod.trim(),
        intent: input.intent.trim(),
      },
    });
    const current = this.context.current();
    await this.prisma.auditEvent.create({
      data: {
        action: 'onboarding_lead.submitted',
        targetType: 'onboarding_lead',
        targetId: created.id,
        requestId: current?.requestId,
        after: {
          kind: created.kind,
          institutionName: created.institutionName,
        },
      },
    });
    return toLeadSummary(created);
  }

  async list(): Promise<OnboardingLeadSummary[]> {
    await this.requireOrganizationAdministrator();
    const rows = await this.prisma.onboardingLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toLeadSummary);
  }

  async updateStatus(
    id: string,
    status: OnboardingLeadStatus,
  ): Promise<OnboardingLeadSummary> {
    const actor = await this.requireOrganizationAdministrator();
    const existing = await this.prisma.onboardingLead.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new OnboardingLeadNotFoundError();
    }

    const updated = await this.prisma.onboardingLead.update({
      where: { id },
      data: { status, statusChangedAt: new Date() },
    });
    await this.prisma.auditEvent.create({
      data: {
        tenantId: actor.tenantId,
        actorAccountId: actor.accountId,
        action: 'onboarding_lead.status_changed',
        targetType: 'onboarding_lead',
        targetId: id,
        requestId: actor.requestId,
        before: { status: existing.status },
        after: { status },
      },
    });
    return toLeadSummary(updated);
  }

  private async requireOrganizationAdministrator(): Promise<{
    accountId: string;
    tenantId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.ORGANIZATION_ADMIN
    ) {
      throw new OrganizationAdministrationDeniedError();
    }
    const platformTenant = await this.prisma.tenant.findUnique({
      where: { id: current.tenantId },
      select: { type: true },
    });
    if (platformTenant?.type !== TenantType.PLATFORM) {
      throw new OrganizationAdministrationDeniedError();
    }
    return {
      accountId: current.actorAccountId,
      tenantId: current.tenantId,
      requestId: current.requestId,
    };
  }
}

function toLeadSummary(row: {
  id: string;
  kind: OnboardingLeadKind;
  institutionName: string;
  contactName: string;
  contactMethod: string;
  intent: string;
  status: OnboardingLeadStatus;
  createdAt: Date;
  statusChangedAt: Date | null;
}): OnboardingLeadSummary {
  return {
    id: row.id,
    kind: row.kind,
    institutionName: row.institutionName,
    contactName: row.contactName,
    contactMethod: row.contactMethod,
    intent: row.intent,
    status: row.status,
    createdAt: row.createdAt,
    statusChangedAt: row.statusChangedAt,
  };
}
