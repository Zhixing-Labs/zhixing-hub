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

export type EnterpriseStaffRole =
  | typeof MembershipRole.HR
  | typeof MembershipRole.PROJECT_LEAD
  | typeof MembershipRole.MENTOR
  | typeof MembershipRole.ENTERPRISE_DASHBOARD;

export interface CreateEnterpriseDepartmentInput {
  name: string;
}

export interface CreateEnterpriseMemberInput {
  displayName: string;
  phone: string;
  role: EnterpriseStaffRole;
  departmentId: string;
}

export class EnterpriseOrganizationDeniedError extends Error {
  constructor(
    message = 'Current role cannot manage this enterprise organization',
  ) {
    super(message);
    this.name = 'EnterpriseOrganizationDeniedError';
  }
}

export class EnterpriseOrganizationNotFoundError extends Error {
  constructor() {
    super('Enterprise organization record was not found');
    this.name = 'EnterpriseOrganizationNotFoundError';
  }
}

const STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.ENTERPRISE_ADMIN,
  MembershipRole.HR,
  MembershipRole.PROJECT_LEAD,
  MembershipRole.MENTOR,
  MembershipRole.ENTERPRISE_DASHBOARD,
]);

const CREATABLE_ROLES = new Set<MembershipRole>([
  MembershipRole.HR,
  MembershipRole.PROJECT_LEAD,
  MembershipRole.MENTOR,
  MembershipRole.ENTERPRISE_DASHBOARD,
]);

/**
 * 企业组织与成员（《07》2.3、3.3）：部门不套部门；管理员创建 HR / 项目负责人 / 导师 / 看板。
 */
@Injectable()
export class EnterpriseOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async getOrg() {
    const actor = await this.requireActor();
    const [enterprise, departments, members] = await Promise.all([
      this.prisma.enterprise.findUniqueOrThrow({
        where: { tenantId: actor.tenantId },
        include: { locations: true, natureTag: true, industryCategory: true },
      }),
      this.prisma.department.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.membership.findMany({
        where: { tenantId: actor.tenantId, role: { in: [...STAFF_ROLES] } },
        include: { account: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      natureTagCode: enterprise.natureTagCode,
      industryCategoryCode: enterprise.industryCategoryCode,
      locations: enterprise.locations.map((location) => ({
        id: location.id,
        divisionCode: location.divisionCode,
      })),
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        status: department.status,
      })),
      members: members.map((member) => ({
        accountId: member.accountId,
        membershipId: member.id,
        displayName: member.account.displayName,
        phone: member.account.phone,
        role: member.role as
          | 'ENTERPRISE_ADMIN'
          | 'HR'
          | 'PROJECT_LEAD'
          | 'MENTOR'
          | 'ENTERPRISE_DASHBOARD',
        departmentId: member.departmentId,
        accountStatus: member.account.status,
        membershipStatus: member.status,
      })),
    };
  }

  async createDepartment(input: CreateEnterpriseDepartmentInput) {
    const actor = await this.requireActor();
    try {
      const department = await this.prisma.department.create({
        data: { tenantId: actor.tenantId, name: input.name.trim() },
      });
      await this.writeAudit(
        actor,
        'enterprise.department.created',
        'department',
        department.id,
        { name: department.name },
      );
      return {
        id: department.id,
        name: department.name,
        status: department.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async replaceLocations(locationCodes: string[]) {
    const actor = await this.requireActor();
    const uniqueCodes = [...new Set(locationCodes)];
    if (uniqueCodes.length === 0) {
      throw new OrganizationReferenceNotFoundError(
        'An enterprise must keep at least one location',
      );
    }
    await this.requirePrefectures(uniqueCodes);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.enterpriseLocation.deleteMany({
        where: { tenantId: actor.tenantId },
      });
      await transaction.enterpriseLocation.createMany({
        data: uniqueCodes.map((divisionCode) => ({
          tenantId: actor.tenantId,
          divisionCode,
        })),
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'enterprise.locations.replaced',
          targetType: 'tenant',
          targetId: actor.tenantId,
          requestId: actor.requestId,
          after: { locationCodes: uniqueCodes },
        },
      });
    });
  }

  async createMember(input: CreateEnterpriseMemberInput) {
    const actor = await this.requireActor();
    if (!CREATABLE_ROLES.has(input.role)) {
      throw new EnterpriseOrganizationDeniedError();
    }
    const department = await this.prisma.department.findFirst({
      where: {
        id: input.departmentId,
        tenantId: actor.tenantId,
        status: RecordStatus.ACTIVE,
      },
    });
    if (!department) {
      throw new OrganizationReferenceNotFoundError();
    }

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
                role: input.role,
                departmentId: department.id,
              },
            },
          },
          include: { membership: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'enterprise.member.created',
            targetType: 'account',
            targetId: account.id,
            requestId: actor.requestId,
            after: {
              role: input.role,
              departmentId: department.id,
              phone: input.phone,
            },
          },
        });
        return account;
      });
      return {
        accountId: created.id,
        membershipId: created.membership!.id,
        displayName: created.displayName,
        phone: created.phone,
        role: input.role,
        departmentId: department.id,
        accountStatus: created.status,
        membershipStatus: created.membership!.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
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
      !CREATABLE_ROLES.has(target.role) ||
      target.status !== RecordStatus.ACTIVE
    ) {
      throw new EnterpriseOrganizationNotFoundError();
    }
    if (target.accountId === actor.accountId) {
      throw new EnterpriseOrganizationDeniedError(
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
          action: 'enterprise.member.disabled',
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

  private async requirePrefectures(codes: string[]): Promise<void> {
    const divisions = await this.prisma.administrativeDivision.findMany({
      where: { code: { in: codes }, level: 'PREFECTURE', active: true },
      select: { code: true },
    });
    if (divisions.length !== codes.length) {
      throw new OrganizationReferenceNotFoundError();
    }
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
      current.role !== MembershipRole.ENTERPRISE_ADMIN
    ) {
      throw new EnterpriseOrganizationDeniedError();
    }
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: { account: true, tenant: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== MembershipRole.ENTERPRISE_ADMIN ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.tenant.type !== TenantType.ENTERPRISE
    ) {
      throw new EnterpriseOrganizationDeniedError();
    }
    return {
      accountId: membership.accountId,
      tenantId: membership.tenantId,
      requestId: current.requestId,
    };
  }

  private async writeAudit(
    actor: { accountId: string; tenantId: string; requestId: string },
    action: string,
    targetType: string,
    targetId: string,
    after: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: actor.tenantId,
        actorAccountId: actor.accountId,
        action,
        targetType,
        targetId,
        requestId: actor.requestId,
        after,
      },
    });
  }
}

function mapPersistenceError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new OrganizationConflictError();
    }
    if (error.code === 'P2003') {
      return new OrganizationReferenceNotFoundError();
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
