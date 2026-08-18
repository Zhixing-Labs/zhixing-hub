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

const UNIVERSITY_WIDE_ROLES = new Set<MembershipRole>([
  MembershipRole.UNIVERSITY_ADMIN,
  MembershipRole.UNIVERSITY_DASHBOARD,
]);

const COLLEGE_SCOPED_STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.COLLEGE_ADMIN,
  MembershipRole.PROGRAM_LEAD,
  MembershipRole.COUNSELOR,
]);

const STAFF_ROLES = new Set<MembershipRole>([
  ...UNIVERSITY_WIDE_ROLES,
  ...COLLEGE_SCOPED_STAFF_ROLES,
]);

export type UniversityStaffRole =
  | typeof MembershipRole.UNIVERSITY_DASHBOARD
  | typeof MembershipRole.COLLEGE_ADMIN
  | typeof MembershipRole.PROGRAM_LEAD
  | typeof MembershipRole.COUNSELOR;

export type UniversityListedRole =
  | typeof MembershipRole.UNIVERSITY_ADMIN
  | UniversityStaffRole;

export interface CreateCampusInput {
  name: string;
  divisionCode: string;
}

export interface CreateCollegeInput {
  name: string;
  campusIds: string[];
}

export interface ReplaceCollegeCampusesInput {
  campusIds: string[];
}

export interface CreateMajorInput {
  collegeId: string;
  name: string;
}

export interface CreateClassInput {
  majorId: string;
  name: string;
  gradeLabel: string;
  counselorMembershipId?: string;
}

export interface AssignClassCounselorInput {
  counselorMembershipId: string | null;
}

export interface CreateUniversityMemberInput {
  displayName: string;
  phone: string;
  role: UniversityStaffRole;
  collegeId?: string;
}

export class UniversityOrganizationDeniedError extends Error {
  constructor(
    message = 'Current role cannot manage this university organization',
  ) {
    super(message);
    this.name = 'UniversityOrganizationDeniedError';
  }
}

export class UniversityOrganizationNotFoundError extends Error {
  constructor(message = 'University organization record was not found') {
    super(message);
    this.name = 'UniversityOrganizationNotFoundError';
  }
}

@Injectable()
export class UniversityOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async getOrgTree(): Promise<{
    campuses: Array<{
      id: string;
      name: string;
      divisionCode: string;
      status: RecordStatus;
    }>;
    colleges: Array<{
      id: string;
      name: string;
      status: RecordStatus;
      campuses: Array<{ campusId: string; sortOrder: number }>;
      majors: Array<{
        id: string;
        name: string;
        status: RecordStatus;
        classes: Array<{
          id: string;
          name: string;
          gradeLabel: string;
          counselorMembershipId: string | null;
          status: RecordStatus;
        }>;
      }>;
    }>;
    members: Array<{
      accountId: string;
      membershipId: string;
      displayName: string;
      phone: string | null;
      role: UniversityListedRole;
      collegeId: string | null;
      accountStatus: AccountStatus;
      membershipStatus: RecordStatus;
    }>;
  }> {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const collegeFilter =
      actor.role === MembershipRole.COLLEGE_ADMIN
        ? { id: actor.collegeId! }
        : {};

    const [campuses, colleges, members] = await Promise.all([
      this.prisma.campus.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.college.findMany({
        where: { tenantId: actor.tenantId, ...collegeFilter },
        include: {
          campusLinks: { orderBy: { sortOrder: 'asc' } },
          majors: {
            orderBy: { name: 'asc' },
            include: {
              classes: { orderBy: [{ gradeLabel: 'asc' }, { name: 'asc' }] },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.membership.findMany({
        where: {
          tenantId: actor.tenantId,
          role: { in: [...STAFF_ROLES] },
          ...(actor.role === MembershipRole.COLLEGE_ADMIN
            ? { collegeId: actor.collegeId }
            : {}),
        },
        include: { account: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const visibleCampuses =
      actor.role === MembershipRole.COLLEGE_ADMIN
        ? campuses.filter((campus) =>
            colleges.some((college) =>
              college.campusLinks.some((link) => link.campusId === campus.id),
            ),
          )
        : campuses;

    const visibleMembers =
      actor.role === MembershipRole.COLLEGE_ADMIN
        ? members.filter(
            (member) =>
              member.collegeId === actor.collegeId &&
              member.role !== MembershipRole.UNIVERSITY_ADMIN &&
              member.role !== MembershipRole.UNIVERSITY_DASHBOARD,
          )
        : members;

    return {
      campuses: visibleCampuses.map((campus) => ({
        id: campus.id,
        name: campus.name,
        divisionCode: campus.divisionCode,
        status: campus.status,
      })),
      colleges: colleges.map((college) => ({
        id: college.id,
        name: college.name,
        status: college.status,
        campuses: college.campusLinks.map((link) => ({
          campusId: link.campusId,
          sortOrder: link.sortOrder,
        })),
        majors: college.majors.map((major) => ({
          id: major.id,
          name: major.name,
          status: major.status,
          classes: major.classes.map((cohort) => ({
            id: cohort.id,
            name: cohort.name,
            gradeLabel: cohort.gradeLabel,
            counselorMembershipId: cohort.counselorMembershipId,
            status: cohort.status,
          })),
        })),
      })),
      members: visibleMembers.map((member) => ({
        accountId: member.accountId,
        membershipId: member.id,
        displayName: member.account.displayName,
        phone: member.account.phone,
        role: member.role as UniversityListedRole,
        collegeId: member.collegeId,
        accountStatus: member.account.status,
        membershipStatus: member.status,
      })),
    };
  }

  async createCampus(input: CreateCampusInput) {
    const actor = await this.requireActor([MembershipRole.UNIVERSITY_ADMIN]);
    await this.requirePrefecture(input.divisionCode);
    try {
      const campus = await this.prisma.campus.create({
        data: {
          tenantId: actor.tenantId,
          name: input.name.trim(),
          divisionCode: input.divisionCode,
        },
      });
      await this.writeAudit(actor, 'university.campus.created', 'campus', campus.id, {
        name: campus.name,
        divisionCode: campus.divisionCode,
      });
      return {
        id: campus.id,
        name: campus.name,
        divisionCode: campus.divisionCode,
        status: campus.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async createCollege(input: CreateCollegeInput) {
    const actor = await this.requireActor([MembershipRole.UNIVERSITY_ADMIN]);
    const campusIds = uniqueIds(input.campusIds);
    if (campusIds.length === 0) {
      throw new OrganizationReferenceNotFoundError(
        'A college must attach at least one campus',
      );
    }
    await this.requireTenantCampuses(actor.tenantId, campusIds);

    try {
      const college = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.college.create({
          data: {
            tenantId: actor.tenantId,
            name: input.name.trim(),
            campusLinks: {
              create: campusIds.map((campusId, sortOrder) => ({
                campusId,
                sortOrder,
              })),
            },
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'university.college.created',
            targetType: 'college',
            targetId: created.id,
            requestId: actor.requestId,
            after: { name: created.name, campusIds },
          },
        });
        return created;
      });
      return { id: college.id, name: college.name, status: college.status };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async replaceCollegeCampuses(
    collegeId: string,
    input: ReplaceCollegeCampusesInput,
  ) {
    const actor = await this.requireActor([MembershipRole.UNIVERSITY_ADMIN]);
    const campusIds = uniqueIds(input.campusIds);
    if (campusIds.length === 0) {
      throw new OrganizationReferenceNotFoundError(
        'A college must attach at least one campus',
      );
    }
    await this.requireCollegeInTenant(actor.tenantId, collegeId);
    await this.requireTenantCampuses(actor.tenantId, campusIds);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.collegeCampus.deleteMany({
          where: { tenantId: actor.tenantId, collegeId },
        });
        await transaction.collegeCampus.createMany({
          data: campusIds.map((campusId, sortOrder) => ({
            tenantId: actor.tenantId,
            collegeId,
            campusId,
            sortOrder,
          })),
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'university.college.campuses_replaced',
            targetType: 'college',
            targetId: collegeId,
            requestId: actor.requestId,
            after: { campusIds },
          },
        });
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async createMajor(input: CreateMajorInput) {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    await this.requireManagedCollege(actor, input.collegeId);
    try {
      const major = await this.prisma.major.create({
        data: {
          tenantId: actor.tenantId,
          collegeId: input.collegeId,
          name: input.name.trim(),
        },
      });
      await this.writeAudit(actor, 'university.major.created', 'major', major.id, {
        collegeId: major.collegeId,
        name: major.name,
      });
      return {
        id: major.id,
        collegeId: major.collegeId,
        name: major.name,
        status: major.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async createClass(input: CreateClassInput) {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const major = await this.requireManagedMajor(actor, input.majorId);
    if (input.counselorMembershipId) {
      await this.requireCounselorInCollege(
        actor.tenantId,
        major.collegeId,
        input.counselorMembershipId,
      );
    }
    try {
      const cohort = await this.prisma.cohortClass.create({
        data: {
          tenantId: actor.tenantId,
          majorId: major.id,
          name: input.name.trim(),
          gradeLabel: input.gradeLabel.trim(),
          counselorMembershipId: input.counselorMembershipId ?? null,
        },
      });
      await this.writeAudit(actor, 'university.class.created', 'class', cohort.id, {
        majorId: cohort.majorId,
        name: cohort.name,
        gradeLabel: cohort.gradeLabel,
        counselorMembershipId: cohort.counselorMembershipId,
      });
      return {
        id: cohort.id,
        majorId: cohort.majorId,
        name: cohort.name,
        gradeLabel: cohort.gradeLabel,
        counselorMembershipId: cohort.counselorMembershipId,
        status: cohort.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async assignClassCounselor(
    classId: string,
    input: AssignClassCounselorInput,
  ) {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const cohort = await this.prisma.cohortClass.findFirst({
      where: { id: classId, tenantId: actor.tenantId },
      include: { major: true },
    });
    if (!cohort) {
      throw new UniversityOrganizationNotFoundError();
    }
    await this.requireManagedCollege(actor, cohort.major.collegeId);
    if (input.counselorMembershipId) {
      await this.requireCounselorInCollege(
        actor.tenantId,
        cohort.major.collegeId,
        input.counselorMembershipId,
      );
    }

    try {
      const updated = await this.prisma.cohortClass.update({
        where: { id: classId },
        data: { counselorMembershipId: input.counselorMembershipId },
      });
      await this.writeAudit(
        actor,
        'university.class.counselor_assigned',
        'class',
        classId,
        {
          counselorMembershipId: updated.counselorMembershipId,
        },
      );
      return {
        id: updated.id,
        majorId: updated.majorId,
        name: updated.name,
        gradeLabel: updated.gradeLabel,
        counselorMembershipId: updated.counselorMembershipId,
        status: updated.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async createMember(input: CreateUniversityMemberInput) {
    const actor = await this.requireActor([
      MembershipRole.UNIVERSITY_ADMIN,
      MembershipRole.COLLEGE_ADMIN,
    ]);
    const role = input.role;
    if (!canCreateRole(actor.role, role)) {
      throw new UniversityOrganizationDeniedError();
    }

    let collegeId: string | null = null;
    if (COLLEGE_SCOPED_STAFF_ROLES.has(role)) {
      if (!input.collegeId) {
        throw new OrganizationReferenceNotFoundError(
          'College-scoped staff must belong to a college',
        );
      }
      await this.requireManagedCollege(actor, input.collegeId);
      collegeId = input.collegeId;
    } else if (input.collegeId) {
      throw new UniversityOrganizationDeniedError(
        'University-wide roles cannot attach to a college',
      );
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
                role,
                collegeId,
              },
            },
          },
          include: { membership: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorAccountId: actor.accountId,
            action: 'university.member.created',
            targetType: 'account',
            targetId: account.id,
            requestId: actor.requestId,
            after: {
              role,
              collegeId,
              phone: input.phone,
              status: account.status,
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
        role,
        collegeId,
        accountStatus: created.status,
        membershipStatus: created.membership!.status,
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  private async requireActor(
    allowedRoles: MembershipRole[],
  ): Promise<UniversityActor> {
    const current = this.context.requireCurrent();
    if (!current.actorAccountId || !current.tenantId || !current.role) {
      throw new UniversityOrganizationDeniedError();
    }
    if (!allowedRoles.includes(current.role)) {
      throw new UniversityOrganizationDeniedError();
    }

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: {
        account: true,
        tenant: true,
      },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== current.role ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.account.kind !== 'END_USER' ||
      membership.tenant.type !== TenantType.UNIVERSITY
    ) {
      throw new UniversityOrganizationDeniedError();
    }
    if (
      membership.role === MembershipRole.COLLEGE_ADMIN &&
      !membership.collegeId
    ) {
      throw new UniversityOrganizationDeniedError();
    }

    return {
      accountId: membership.accountId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      role: membership.role,
      collegeId: membership.collegeId,
      requestId: current.requestId,
    };
  }

  private async requirePrefecture(code: string): Promise<void> {
    const division = await this.prisma.administrativeDivision.findUnique({
      where: { code },
    });
    if (
      !division ||
      division.level !== 'PREFECTURE' ||
      !division.active
    ) {
      throw new OrganizationReferenceNotFoundError();
    }
  }

  private async requireTenantCampuses(
    tenantId: string,
    campusIds: string[],
  ): Promise<void> {
    const campuses = await this.prisma.campus.findMany({
      where: {
        tenantId,
        id: { in: campusIds },
        status: RecordStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (campuses.length !== campusIds.length) {
      throw new OrganizationReferenceNotFoundError();
    }
  }

  private async requireCollegeInTenant(
    tenantId: string,
    collegeId: string,
  ): Promise<void> {
    const college = await this.prisma.college.findFirst({
      where: { id: collegeId, tenantId, status: RecordStatus.ACTIVE },
      select: { id: true },
    });
    if (!college) {
      throw new UniversityOrganizationNotFoundError();
    }
  }

  private async requireManagedCollege(
    actor: UniversityActor,
    collegeId: string,
  ): Promise<void> {
    if (
      actor.role === MembershipRole.COLLEGE_ADMIN &&
      actor.collegeId !== collegeId
    ) {
      throw new UniversityOrganizationDeniedError();
    }
    await this.requireCollegeInTenant(actor.tenantId, collegeId);
  }

  private async requireManagedMajor(
    actor: UniversityActor,
    majorId: string,
  ): Promise<{ id: string; collegeId: string }> {
    const major = await this.prisma.major.findFirst({
      where: { id: majorId, tenantId: actor.tenantId, status: RecordStatus.ACTIVE },
      select: { id: true, collegeId: true },
    });
    if (!major) {
      throw new UniversityOrganizationNotFoundError();
    }
    await this.requireManagedCollege(actor, major.collegeId);
    return major;
  }

  private async requireCounselorInCollege(
    tenantId: string,
    collegeId: string,
    membershipId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        collegeId,
        role: MembershipRole.COUNSELOR,
        status: RecordStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new OrganizationReferenceNotFoundError();
    }
  }

  private async writeAudit(
    actor: UniversityActor,
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

interface UniversityActor {
  accountId: string;
  membershipId: string;
  tenantId: string;
  role: MembershipRole;
  collegeId: string | null;
  requestId: string;
}

function canCreateRole(
  actorRole: MembershipRole,
  targetRole: UniversityStaffRole,
): boolean {
  if (actorRole === MembershipRole.UNIVERSITY_ADMIN) {
    return (
      targetRole === MembershipRole.UNIVERSITY_DASHBOARD ||
      COLLEGE_SCOPED_STAFF_ROLES.has(targetRole)
    );
  }
  return (
    actorRole === MembershipRole.COLLEGE_ADMIN &&
    (targetRole === MembershipRole.PROGRAM_LEAD ||
      targetRole === MembershipRole.COUNSELOR)
  );
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
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
