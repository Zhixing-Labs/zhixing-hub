import { Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  CaptchaAdapter,
  CaptchaChallenge,
  SmsAdapter,
  SmsCodePurpose,
  SmsDelivery,
} from './integration.adapters';

const MOCK_CAPTCHA_TOKEN = 'zhixing-mock-captcha-passed';

export class MockIntegrationNotAllowedError extends Error {
  constructor() {
    super('Mock external integrations are not allowed in production');
    this.name = 'MockIntegrationNotAllowedError';
  }
}

@Injectable()
export class MockCaptchaAdapter implements CaptchaAdapter {
  async issueChallenge(): Promise<CaptchaChallenge> {
    assertMockAllowed();
    return { token: MOCK_CAPTCHA_TOKEN, mock: true };
  }

  async verify(token: string): Promise<boolean> {
    assertMockAllowed();
    const actual = Buffer.from(token, 'utf8');
    const expected = Buffer.from(MOCK_CAPTCHA_TOKEN, 'utf8');
    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  }
}

@Injectable()
export class MockSmsAdapter implements SmsAdapter {
  async sendCode(
    _phone: string,
    code: string,
    _purpose: SmsCodePurpose,
  ): Promise<SmsDelivery> {
    assertMockAllowed();
    return {
      messageId: `mock-sms-${randomUUID()}`,
      mock: true,
      debugCode: code,
    };
  }
}

function assertMockAllowed(): void {
  const mode = process.env.INTEGRATION_MODE?.trim() || 'mock';
  if (mode !== 'mock' || process.env.NODE_ENV === 'production') {
    throw new MockIntegrationNotAllowedError();
  }
}
