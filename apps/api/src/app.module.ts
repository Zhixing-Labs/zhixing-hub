import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import {
  RequestContextMiddleware,
  ServerCoreModule,
} from '@zhixing/server-core';
import { HealthController } from './health/health.controller';
import { LegalDocumentGovernanceController } from './governance/legal-document-governance.controller';
import { AccountSecurityController } from './identity/account-security.controller';
import { CounselorPhoneChangeController } from './identity/counselor-phone-change.controller';
import { CsrfGuard } from './identity/csrf.guard';
import { IdentityController } from './identity/identity.controller';
import { PhoneChangeController } from './identity/phone-change.controller';
import { PlatformAccountController } from './identity/platform-account.controller';
import { PlatformRegistrationController } from './identity/platform-registration.controller';
import { SessionAuthGuard } from './identity/session-auth.guard';
import { StudentProfileController } from './identity/student-profile.controller';
import { StudentSecurityController } from './identity/student-security.controller';
import { CounselorStudentImportController } from './organization/counselor-student-import.controller';
import { OrganizationController } from './organization/organization.controller';
import {
  OrganizationOnboardingLeadController,
  PublicOnboardingLeadController,
} from './organization/onboarding-lead.controller';
import { EnterpriseOrganizationController } from './organization/enterprise-organization.controller';
import { UniversityOrganizationController } from './organization/university-organization.controller';
import {
  StudentClassTransferController,
  UniversityStaffController,
} from './organization/university-staff.controller';
import { UniversityStudentController } from './organization/university-student.controller';
import {
  GovernmentOrganizationController,
  PublicAcademyController,
} from './organization/government-organization.controller';

@Module({
  imports: [ServerCoreModule],
  controllers: [
    HealthController,
    LegalDocumentGovernanceController,
    AccountSecurityController,
    CounselorPhoneChangeController,
    IdentityController,
    PhoneChangeController,
    PlatformAccountController,
    PlatformRegistrationController,
    StudentProfileController,
    StudentSecurityController,
    OrganizationController,
    PublicOnboardingLeadController,
    OrganizationOnboardingLeadController,
    UniversityOrganizationController,
    UniversityStaffController,
    StudentClassTransferController,
    CounselorStudentImportController,
    UniversityStudentController,
    EnterpriseOrganizationController,
    GovernmentOrganizationController,
    PublicAcademyController,
  ],
  providers: [SessionAuthGuard, CsrfGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
