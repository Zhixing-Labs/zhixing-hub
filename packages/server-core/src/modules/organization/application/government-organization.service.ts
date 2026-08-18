import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  Prisma,
  RecordStatus,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import {
  OrganizationConflictError,
  OrganizationReferenceNotFoundError,
} from './organization-admin.service';

export interface CreateGovernmentMemberInput {
  displayName: string;
  phone: string;
}

export class GovernmentOrganizationDeniedError extends Error {
  constructor(
    message = 'Current role cannot manage this government organization',
  ) {
    super(message);
    this.name = 'GovernmentOrganizationDeniedError';
  }
}

export class GovernmentOrganizationNotFoundError extends Error {
  constructor() {
    super('Government organization record was not found');
    this.name = 'GovernmentOrganizationNotFoundError';
  }
}

/**
 * 政务机关账户（《07》3.4）：带管理权限的看板账户管理本机关不带管理权限的账户。
 */
@Injectable()
export class GovernmentOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async listMembers() {
    const actor = await this.requireActor();
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId: actor.tenantId,
        role: {
          in: [
            MembershipRole.GOVERNMENT_DASHBOARD_ADMIN,
            MembershipRole.GOVERNMENT_DASHBOARD,
          ],
        },
      },
      include: { account: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return members.map((member) => ({
      accountId: member.accountId,
      membershipId: member.id,
      displayName: member.account.displayName,
      phone: member.account.phone,
      role: member.role as
        | 'GOVERNMENT_DASHBOARD_ADMIN'
        | 'GOVERNMENT_DASHBOARD',
      accountStatus: member.account.status,
      membershipStatus: member.status,
    }));
  }

  async createMember(input: CreateGovernmentMemberInput) {
    const actor = await this.requireActor();
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.account.create({
          data: {
            kind: 'END_USER',
            phone: input.phone,
            username: null,
            displayName: input.displayName.trim(),
            status: AccountStatus.PENDING_ACTIVATION,
            membership: {
              create: {
                tenantId: actor.tenantId,
                role: MembershipRole.GOVERNMENT_DASHBOARD,
              },
            },
          },
          include: { membership: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'government.member.created',
            targetType: 'account',
            targetId: account.id,
            requestId: actor.requestId,
            after: { phone: input.phone, role: MembershipRole.GOVERNMENT_DASHBOARD },
          },
        });
        return account;
      });
      return {
        accountId: created.id,
        membershipId: created.membership!.id,
        displayName: created.displayName,
        phone: created.phone,
        role: MembershipRole.GOVERNMENT_DASHBOARD,
        accountStatus: created.status,
        membershipStatus: created.membership!.status,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new OrganizationConflictError();
        }
        if (error.code === 'P2003') {
          throw new OrganizationReferenceNotFoundError();
        }
      }
      throw error;
    }
  }

  async disableMember(membershipId: string): Promise<void> {
    const actor = await this.requireActor();
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: actor.tenantId },
      include: { account: true },
    });
    if (
      !target ||
      target.role !== MembershipRole.GOVERNMENT_DASHBOARD ||
      target.status !== RecordStatus.ACTIVE
    ) {
      throw new GovernmentOrganizationNotFoundError();
    }
    if (target.accountId === actor.accountId) {
      throw new GovernmentOrganizationDeniedError(
        'Staff cannot disable their own account',
      );
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: target.accountId },
        data: {
          status: AccountStatus.SUSPENDED,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.membership.update({
        where: { id: target.id },
        data: { status: RecordStatus.DISABLED },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId: target.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'government.member.disabled',
          targetType: 'account',
          targetId: target.accountId,
          requestId: actor.requestId,
          after: {
            status: AccountStatus.SUSPENDED,
            membershipStatus: RecordStatus.DISABLED,
          },
        },
      }),
    ]);
  }

  private async requireActor(): Promise<{
    accountId: string;
    tenantId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.GOVERNMENT_DASHBOARD_ADMIN
    ) {
      throw new GovernmentOrganizationDeniedError();
    }
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: { account: true, tenant: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== MembershipRole.GOVERNMENT_DASHBOARD_ADMIN ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.tenant.type !== TenantType.GOVERNMENT
    ) {
      throw new GovernmentOrganizationDeniedError();
    }
    return {
      accountId: membership.accountId,
      tenantId: membership.tenantId,
      requestId: current.requestId,
    };
  }
}
