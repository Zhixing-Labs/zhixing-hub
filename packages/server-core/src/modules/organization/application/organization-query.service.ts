import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../../infrastructure/request-context/request-context.service';

export interface CurrentOrganization {
  id: string;
  type: 'PLATFORM' | 'UNIVERSITY' | 'ENTERPRISE' | 'GOVERNMENT';
  name: string;
  status: 'ACTIVE' | 'DISABLED';
}

@Injectable()
export class OrganizationQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async getCurrentOrganization(): Promise<CurrentOrganization | null> {
    const tenantId = this.context.requireTenantId();
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
      },
    });
  }

  async listAdministrativeDivisions() {
    this.context.requireCurrent();
    return this.prisma.administrativeDivision.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: {
        code: true,
        name: true,
        level: true,
        parentCode: true,
      },
    });
  }
}
