import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  Prisma,
  RecordStatus,
  TenantType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';
import { PasswordHasher } from '../domain/password-hasher';

export type ManagedPlatformRole =
  | typeof MembershipRole.ORGANIZATION_ADMIN
  | typeof MembershipRole.OPERATIONS_SPECIALIST
  | typeof MembershipRole.PLATFORM_DASHBOARD;

const MANAGED_PLATFORM_ROLES = new Set<MembershipRole>([
  MembershipRole.ORGANIZATION_ADMIN,
  MembershipRole.OPERATIONS_SPECIALIST,
  MembershipRole.PLATFORM_DASHBOARD,
]);

export interface CreatePlatformAccountInput {
  username: string;
  displayName: string;
  role: ManagedPlatformRole;
}

export interface PlatformAccountSummary {
  accountId: string;
  username: string;
  displayName: string;
  role: ManagedPlatformRole;
  status: AccountStatus;
}

export interface CreatedPlatformAccount extends PlatformAccountSummary {
  initialPassword: string;
}

export class SuperAdminRequiredError extends Error {
  constructor() {
    super('Only the unique platform super admin can manage platform accounts');
    this.name = 'SuperAdminRequiredError';
  }
}

export class PlatformAccountConflictError extends Error {
  constructor() {
    super('Platform username already exists');
    this.name = 'PlatformAccountConflictError';
  }
}

export class PlatformAccountNotFoundError extends Error {
  constructor() {
    super('Managed platform account does not exist');
    this.name = 'PlatformAccountNotFoundError';
  }
}

export class InvalidManagedPlatformRoleError extends Error {
  constructor() {
    super('Super admin can only create organization admin, operations, or dashboard accounts');
    this.name = 'InvalidManagedPlatformRoleError';
  }
}

@Injectable()
export class PlatformAccountAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async create(
    input: CreatePlatformAccountInput,
  ): Promise<CreatedPlatformAccount> {
    const actor = await this.requireSuperAdmin();
    if (!MANAGED_PLATFORM_ROLES.has(input.role)) {
      throw new InvalidManagedPlatformRoleError();
    }

    const initialPassword = createInitialPassword();
    const passwordHash = await this.passwordHasher.hash(initialPassword);
    try {
      const account = await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.account.create({
          data: {
            kind: 'PLATFORM_ADMIN',
            username: input.username,
            phone: null,
            passwordHash,
            displayName: input.displayName.trim(),
            status: 'PENDING_ACTIVATION',
            membership: {
              create: {
                tenantId: actor.tenantId,
                role: input.role,
              },
            },
          },
          include: { membership: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'platform.account.created',
            targetType: 'account',
            targetId: account.id,
            requestId: actor.requestId,
            after: {
              username: account.username,
              role: input.role,
              phoneBound: false,
              status: account.status,
              oneTimeInitialPasswordIssued: true,
            },
          },
        });
        return {
          accountId: account.id,
          username: account.username ?? input.username,
          displayName: account.displayName,
          role: input.role,
          status: account.status,
        };
      });
      return { ...account, initialPassword };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new PlatformAccountConflictError();
      }
      throw error;
    }
  }

  async disable(accountId: string): Promise<void> {
    const { actor, target } = await this.requireManagedPlatformAccount(
      accountId,
    );

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: {
          status: AccountStatus.SUSPENDED,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.membership.update({
        where: { accountId },
        data: { status: RecordStatus.DISABLED },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'platform.account.disabled',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          before: {
            status: target.status,
            membershipStatus: target.membership.status,
          },
          after: {
            status: AccountStatus.SUSPENDED,
            membershipStatus: RecordStatus.DISABLED,
          },
        },
      }),
    ]);
  }

  async resetTotp(accountId: string): Promise<void> {
    const { actor, target } = await this.requireManagedPlatformAccount(
      accountId,
    );
    if (target.status === AccountStatus.SUSPENDED) {
      throw new PlatformAccountNotFoundError();
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: {
          status: AccountStatus.PENDING_ACTIVATION,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.platformAccountEnrollment.deleteMany({
        where: { accountId },
      }),
      this.prisma.totpRecoveryCode.deleteMany({
        where: { accountId },
      }),
      this.prisma.totpCredential.deleteMany({
        where: { accountId },
      }),
      this.prisma.authSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'platform.account.totp_reset',
          targetType: 'account',
          targetId: accountId,
          requestId: actor.requestId,
          before: { status: target.status },
          after: {
            status: AccountStatus.PENDING_ACTIVATION,
            totpCleared: true,
            passwordPreserved: true,
          },
        },
      }),
    ]);
  }

  private async requireManagedPlatformAccount(accountId: string): Promise<{
    actor: {
      accountId: string;
      tenantId: string;
      requestId: string;
    };
    target: {
      id: string;
      status: AccountStatus;
      membership: { status: RecordStatus };
    };
  }> {
    const actor = await this.requireSuperAdmin();
    if (accountId === actor.accountId) {
      throw new PlatformAccountNotFoundError();
    }

    const target = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { membership: true },
    });
    if (
      !target ||
      target.kind !== 'PLATFORM_ADMIN' ||
      !target.membership ||
      target.membership.tenantId !== actor.tenantId ||
      target.membership.role === MembershipRole.SUPER_ADMIN ||
      !MANAGED_PLATFORM_ROLES.has(target.membership.role)
    ) {
      throw new PlatformAccountNotFoundError();
    }

    return {
      actor,
      target: {
        id: target.id,
        status: target.status,
        membership: { status: target.membership.status },
      },
    };
  }

  private async requireSuperAdmin(): Promise<{
    accountId: string;
    tenantId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.SUPER_ADMIN
    ) {
      throw new SuperAdminRequiredError();
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: current.tenantId },
      select: { type: true },
    });
    if (tenant?.type !== TenantType.PLATFORM) {
      throw new SuperAdminRequiredError();
    }
    return {
      accountId: current.actorAccountId,
      tenantId: current.tenantId,
      requestId: current.requestId,
    };
  }
}

function createInitialPassword(): string {
  return `Zx9!${randomBytes(18).toString('base64url')}`;
}
