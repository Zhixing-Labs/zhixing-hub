import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RequestContextModule } from '../../infrastructure/request-context/request-context.module';
import { IntegrationModule } from '../integration/integration.module';
import { ClassTransferService } from './application/class-transfer.service';
import { CounselorStudentImportService } from './application/counselor-student-import.service';
import { EnterpriseOrganizationService } from './application/enterprise-organization.service';
import { GovernmentOrganizationService } from './application/government-organization.service';
import { OnboardingLeadService } from './application/onboarding-lead.service';
import { OrganizationAdminService } from './application/organization-admin.service';
import { OrganizationQueryService } from './application/organization-query.service';
import { PublicAcademyAdminService } from './application/public-academy-admin.service';
import { StudentAdminService } from './application/student-admin.service';
import { UniversityOrganizationService } from './application/university-organization.service';
import { UniversityStaffService } from './application/university-staff.service';

@Module({
  imports: [PrismaModule, RequestContextModule, IntegrationModule],
  providers: [
    OrganizationAdminService,
    OrganizationQueryService,
    OnboardingLeadService,
    UniversityOrganizationService,
    UniversityStaffService,
    ClassTransferService,
    CounselorStudentImportService,
    StudentAdminService,
    EnterpriseOrganizationService,
    GovernmentOrganizationService,
    PublicAcademyAdminService,
  ],
  exports: [
    OrganizationAdminService,
    OrganizationQueryService,
    OnboardingLeadService,
    UniversityOrganizationService,
    UniversityStaffService,
    ClassTransferService,
    CounselorStudentImportService,
    StudentAdminService,
    EnterpriseOrganizationService,
    GovernmentOrganizationService,
    PublicAcademyAdminService,
  ],
})
export class OrganizationModule {}
