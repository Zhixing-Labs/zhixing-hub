import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { RequestContextModule } from '../../infrastructure/request-context/request-context.module';
import { IntegrationModule } from '../integration/integration.module';
import { AccountSecurityService } from './application/account-security.service';
import { ActivationCodeService } from './application/activation-code.service';
import { CounselorStudentSecurityService } from './application/counselor-student-security.service';
import { IdentityService } from './application/identity.service';
import { LoginThrottleService } from './application/login-throttle.service';
import { PlatformAccountAdminService } from './application/platform-account-admin.service';
import { PhoneChangeService } from './application/phone-change.service';
import { PlatformAccountEnrollmentService } from './application/platform-account-enrollment.service';
import { PlatformStudentRegistrationService } from './application/platform-student-registration.service';
import { ProtocolConsentService } from './application/protocol-consent.service';
import { StudentProfileService } from './application/student-profile.service';
import { SmsLoginService } from './application/sms-login.service';
import { UserAccountActivationService } from './application/user-account-activation.service';
import { PasswordHasher } from './domain/password-hasher';
import { TotpCipher } from './domain/totp-cipher';
import { TotpService } from './domain/totp.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RequestContextModule,
    IntegrationModule,
  ],
  providers: [
    AccountSecurityService,
    ActivationCodeService,
    CounselorStudentSecurityService,
    IdentityService,
    LoginThrottleService,
    PasswordHasher,
    PhoneChangeService,
    PlatformAccountAdminService,
    PlatformAccountEnrollmentService,
    PlatformStudentRegistrationService,
    ProtocolConsentService,
    SmsLoginService,
    StudentProfileService,
    TotpCipher,
    TotpService,
    UserAccountActivationService,
  ],
  exports: [
    AccountSecurityService,
    ActivationCodeService,
    CounselorStudentSecurityService,
    IdentityService,
    LoginThrottleService,
    PasswordHasher,
    PhoneChangeService,
    PlatformAccountAdminService,
    PlatformAccountEnrollmentService,
    PlatformStudentRegistrationService,
    ProtocolConsentService,
    SmsLoginService,
    StudentProfileService,
    TotpCipher,
    TotpService,
    UserAccountActivationService,
  ],
})
export class IdentityModule {}
