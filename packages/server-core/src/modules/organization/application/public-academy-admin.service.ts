import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  RecordStatus,
  StudentKind,
  TenantType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';

export class PublicAcademyDeniedError extends Error {
  constructor(
    message = 'Only an operations specialist can manage the public academy',
  ) {
    super(message);
    this.name = 'PublicAcademyDeniedError';
  }
}

export class PublicAcademyNotFoundError extends Error {
  constructor() {
    super('Public academy campus was not found');
    this.name = 'PublicAcademyNotFoundError';
  }
}

export class PublicAcademyCampusOccupiedError extends Error {
  constructor() {
    super('A public academy campus with students cannot be disabled');
    this.name = 'PublicAcademyCampusOccupiedError';
  }
}

/**
 * 知行公开学院校区（《07》2.5）：系统预置不可删；无学员的市可停用，已停用拒绝新注册。
 */
@Injectable()
export class PublicAcademyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async listCampuses() {
    await this.requireActor();
    const academy = await this.requireAcademy();
    const campuses = await this.prisma.campus.findMany({
      where: { tenantId: academy.tenantId },
      orderBy: { divisionCode: 'asc' },
    });
    const studentCounts = await this.prisma.studentProfile.groupBy({
      by: ['registrationCityCode'],
      where: {
        tenantId: academy.tenantId,
        kind: StudentKind.PLATFORM,
        registrationCityCode: {
          in: campuses.map((campus) => campus.divisionCode),
        },
      },
      _count: { _all: true },
    });
    const countByCity = new Map(
      studentCounts.map((row) => [
        row.registrationCityCode,
        row._count._all,
      ]),
    );

    return campuses.map((campus) => ({
      id: campus.id,
      name: campus.name,
      divisionCode: campus.divisionCode,
      status: campus.status,
      studentCount: countByCity.get(campus.divisionCode) ?? 0,
    }));
  }

  async setCampusStatus(campusId: string, status: RecordStatus) {
    const actor = await this.requireActor();
    const academy = await this.requireAcademy();
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId: academy.tenantId },
      include: { collegeCampuses: true },
    });
    if (!campus) {
      throw new PublicAcademyNotFoundError();
    }

    if (status === RecordStatus.DISABLED) {
      const studentCount = await this.prisma.studentProfile.count({
        where: {
          tenantId: academy.tenantId,
          kind: StudentKind.PLATFORM,
          registrationCityCode: campus.divisionCode,
        },
      });
      if (studentCount > 0) {
        throw new PublicAcademyCampusOccupiedError();
      }
    }

    const collegeIds = campus.collegeCampuses.map((link) => link.collegeId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.campus.update({
        where: { id: campus.id },
        data: { status },
      });
      if (collegeIds.length > 0) {
        await transaction.college.updateMany({
          where: { id: { in: collegeIds }, tenantId: academy.tenantId },
          data: { status },
        });
      }
      await transaction.auditEvent.create({
        data: {
          tenantId: academy.tenantId,
          actorAccountId: actor.accountId,
          action: 'public_academy.campus.status_changed',
          targetType: 'campus',
          targetId: campus.id,
          requestId: actor.requestId,
          after: { status, collegeIds },
        },
      });
    });

    return {
      id: campus.id,
      name: campus.name,
      divisionCode: campus.divisionCode,
      status,
    };
  }

  private async requireAcademy() {
    const academy = await this.prisma.university.findFirst({
      where: { isPublicAcademy: true },
      select: { tenantId: true },
    });
    if (!academy) {
      throw new PublicAcademyNotFoundError();
    }
    return academy;
  }

  private async requireActor(): Promise<{
    accountId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.OPERATIONS_SPECIALIST
    ) {
      throw new PublicAcademyDeniedError();
    }
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: current.actorAccountId },
      include: { account: true, tenant: true },
    });
    if (
      !membership ||
      membership.tenantId !== current.tenantId ||
      membership.role !== MembershipRole.OPERATIONS_SPECIALIST ||
      membership.status !== RecordStatus.ACTIVE ||
      membership.account.status !== AccountStatus.ACTIVE ||
      membership.tenant.type !== TenantType.PLATFORM
    ) {
      throw new PublicAcademyDeniedError();
    }
    return {
      accountId: membership.accountId,
      requestId: current.requestId,
    };
  }
}
