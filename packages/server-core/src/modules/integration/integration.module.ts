import { Module } from '@nestjs/common';
import {
  CAPTCHA_ADAPTER,
  SMS_ADAPTER,
} from './integration.adapters';
import {
  MockCaptchaAdapter,
  MockSmsAdapter,
} from './mock-integration.adapters';

@Module({
  providers: [
    MockCaptchaAdapter,
    MockSmsAdapter,
    { provide: CAPTCHA_ADAPTER, useExisting: MockCaptchaAdapter },
    { provide: SMS_ADAPTER, useExisting: MockSmsAdapter },
  ],
  exports: [CAPTCHA_ADAPTER, SMS_ADAPTER],
})
export class IntegrationModule {}
