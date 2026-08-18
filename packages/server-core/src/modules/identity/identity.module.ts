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
import { PlatformAccountEnrollmentService } from './application/platform-account-enrollment.service';
import { ProtocolConsentService } from './application/protocol-consent.service';
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
    PlatformAccountAdminService,
    PlatformAccountEnrollmentService,
    ProtocolConsentService,
    SmsLoginService,
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
    PlatformAccountAdminService,
    PlatformAccountEnrollmentService,
    ProtocolConsentService,
    SmsLoginService,
    TotpCipher,
    TotpService,
    UserAccountActivationService,
  ],
})
export class IdentityModule {}
