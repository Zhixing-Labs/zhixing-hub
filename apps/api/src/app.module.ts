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
import { CsrfGuard } from './identity/csrf.guard';
import { IdentityController } from './identity/identity.controller';
import { PlatformAccountController } from './identity/platform-account.controller';
import { SessionAuthGuard } from './identity/session-auth.guard';
import { StudentSecurityController } from './identity/student-security.controller';
import { CounselorStudentImportController } from './organization/counselor-student-import.controller';
import { OrganizationController } from './organization/organization.controller';
import { UniversityOrganizationController } from './organization/university-organization.controller';
import { UniversityStudentController } from './organization/university-student.controller';

@Module({
  imports: [ServerCoreModule],
  controllers: [
    HealthController,
    LegalDocumentGovernanceController,
    AccountSecurityController,
    IdentityController,
    PlatformAccountController,
    StudentSecurityController,
    OrganizationController,
    UniversityOrganizationController,
    CounselorStudentImportController,
    UniversityStudentController,
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
