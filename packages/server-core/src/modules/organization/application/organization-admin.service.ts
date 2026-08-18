import { Injectable } from '@nestjs/common';
import { MembershipRole, Prisma, TenantType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';

export interface InitialTenantAdminInput {
  displayName: string;
  phone: string;
}

export interface CreateUniversityInput {
  name: string;
  initialAdmin: InitialTenantAdminInput;
}

export interface CreateEnterpriseInput {
  name: string;
  natureTagCode: string;
  industryCategoryCode: string;
  locationCodes: string[];
  initialAdmin: InitialTenantAdminInput;
}

export interface CreateGovernmentInput {
  name: string;
  divisionCode: string;
  visibleUniversityTenantIds: string[];
  initialAdmin: InitialTenantAdminInput;
}

export interface CreatedTenant {
  tenantId: string;
  type: Exclude<TenantType, 'PLATFORM'>;
  name: string;
  initialAdminAccountId: string;
}

export class OrganizationAdministrationDeniedError extends Error {
  constructor() {
    super('Only a platform organization administrator can open tenants');
    this.name = 'OrganizationAdministrationDeniedError';
  }
}

export class OrganizationConflictError extends Error {
  constructor(
    message = 'Organization name or member phone already exists',
  ) {
    super(message);
    this.name = 'OrganizationConflictError';
  }
}

export class OrganizationReferenceNotFoundError extends Error {
  constructor(
    message = 'A referenced division, dictionary item, or university does not exist',
  ) {
    super(message);
    this.name = 'OrganizationReferenceNotFoundError';
  }
}

@Injectable()
export class OrganizationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async createUniversity(
    input: CreateUniversityInput,
  ): Promise<CreatedTenant> {
    const actor = await this.requireOrganizationAdministrator();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            type: 'UNIVERSITY',
            name: input.name.trim(),
            university: { create: {} },
          },
        });
        const account = await createInitialAdministrator(
          transaction,
          tenant.id,
          MembershipRole.UNIVERSITY_ADMIN,
          input.initialAdmin,
        );
        await writeTenantCreationAudit(
          transaction,
          actor,
          tenant.id,
          tenant.type,
          tenant.name,
          account.id,
        );
        return {
          tenantId: tenant.id,
          type: TenantType.UNIVERSITY,
          name: tenant.name,
          initialAdminAccountId: account.id,
        };
      });
    } catch (error) {
      throw mapCreationError(error);
    }
  }

  async createEnterprise(
    input: CreateEnterpriseInput,
  ): Promise<CreatedTenant> {
    const actor = await this.requireOrganizationAdministrator();
    if (input.locationCodes.length === 0) {
      throw new OrganizationReferenceNotFoundError();
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            type: 'ENTERPRISE',
            name: input.name.trim(),
            enterprise: {
              create: {
                natureTagCode: input.natureTagCode,
                industryCategoryCode: input.industryCategoryCode,
                locations: {
                  create: [...new Set(input.locationCodes)].map(
                    (divisionCode) => ({ divisionCode }),
                  ),
                },
              },
            },
          },
        });
        const account = await createInitialAdministrator(
          transaction,
          tenant.id,
          MembershipRole.ENTERPRISE_ADMIN,
          input.initialAdmin,
        );
        await writeTenantCreationAudit(
          transaction,
          actor,
          tenant.id,
          tenant.type,
          tenant.name,
          account.id,
        );
        return {
          tenantId: tenant.id,
          type: TenantType.ENTERPRISE,
          name: tenant.name,
          initialAdminAccountId: account.id,
        };
      });
    } catch (error) {
      throw mapCreationError(error);
    }
  }

  async createGovernment(
    input: CreateGovernmentInput,
  ): Promise<CreatedTenant> {
    const actor = await this.requireOrganizationAdministrator();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            type: 'GOVERNMENT',
            name: input.name.trim(),
            governmentOffice: {
              create: { divisionCode: input.divisionCode },
            },
          },
        });
        const visibleUniversityTenantIds = [
          ...new Set(input.visibleUniversityTenantIds),
        ];
        if (visibleUniversityTenantIds.length > 0) {
          await transaction.governmentUniversityScope.createMany({
            data: visibleUniversityTenantIds.map((universityTenantId) => ({
              governmentTenantId: tenant.id,
              universityTenantId,
            })),
          });
        }
        const account = await createInitialAdministrator(
          transaction,
          tenant.id,
          MembershipRole.GOVERNMENT_DASHBOARD_ADMIN,
          input.initialAdmin,
        );
        await writeTenantCreationAudit(
          transaction,
          actor,
          tenant.id,
          tenant.type,
          tenant.name,
          account.id,
        );
        return {
          tenantId: tenant.id,
          type: TenantType.GOVERNMENT,
          name: tenant.name,
          initialAdminAccountId: account.id,
        };
      });
    } catch (error) {
      throw mapCreationError(error);
    }
  }

  async addUniversityAdmin(
    tenantId: string,
    input: InitialTenantAdminInput,
  ): Promise<{ accountId: string }> {
    const actor = await this.requireOrganizationAdministrator();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (!tenant || tenant.type !== TenantType.UNIVERSITY) {
      throw new OrganizationReferenceNotFoundError();
    }

    try {
      const account = await this.prisma.$transaction(async (transaction) => {
        const account = await createInitialAdministrator(
          transaction,
          tenantId,
          MembershipRole.UNIVERSITY_ADMIN,
          input,
        );
        await transaction.auditEvent.create({
          data: {
            tenantId,
            actorAccountId: actor.accountId,
            action: 'tenant.university_admin.created',
            targetType: 'account',
            targetId: account.id,
            requestId: actor.requestId,
            after: { phone: input.phone, role: MembershipRole.UNIVERSITY_ADMIN },
          },
        });
        return account;
      });
      return { accountId: account.id };
    } catch (error) {
      throw mapCreationError(error);
    }
  }

  private async requireOrganizationAdministrator(): Promise<{
    accountId: string;
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
      requestId: current.requestId,
    };
  }
}

async function createInitialAdministrator(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  role:
    | typeof MembershipRole.UNIVERSITY_ADMIN
    | typeof MembershipRole.ENTERPRISE_ADMIN
    | typeof MembershipRole.GOVERNMENT_DASHBOARD_ADMIN,
  input: InitialTenantAdminInput,
): Promise<{ id: string }> {
  return transaction.account.create({
    data: {
      kind: 'END_USER',
      phone: input.phone,
      username: null,
      displayName: input.displayName.trim(),
      status: 'PENDING_ACTIVATION',
      membership: {
        create: {
          tenantId,
          role,
        },
      },
    },
    select: { id: true },
  });
}

async function writeTenantCreationAudit(
  transaction: Prisma.TransactionClient,
  actor: { accountId: string; requestId: string },
  tenantId: string,
  type: TenantType,
  name: string,
  initialAdminAccountId: string,
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      tenantId,
      actorAccountId: actor.accountId,
      action: 'tenant.created',
      targetType: 'tenant',
      targetId: tenantId,
      requestId: actor.requestId,
      after: {
        type,
        name,
        initialAdminAccountId,
      },
    },
  });
}

function mapCreationError(error: unknown): Error {
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
