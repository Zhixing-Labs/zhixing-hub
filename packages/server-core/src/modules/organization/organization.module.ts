import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RequestContextModule } from '../../infrastructure/request-context/request-context.module';
import { CounselorStudentImportService } from './application/counselor-student-import.service';
import { OrganizationAdminService } from './application/organization-admin.service';
import { OrganizationQueryService } from './application/organization-query.service';
import { StudentAdminService } from './application/student-admin.service';
import { UniversityOrganizationService } from './application/university-organization.service';

@Module({
  imports: [PrismaModule, RequestContextModule],
  providers: [
    OrganizationAdminService,
    OrganizationQueryService,
    UniversityOrganizationService,
    CounselorStudentImportService,
    StudentAdminService,
  ],
  exports: [
    OrganizationAdminService,
    OrganizationQueryService,
    UniversityOrganizationService,
    CounselorStudentImportService,
    StudentAdminService,
  ],
})
export class OrganizationModule {}
