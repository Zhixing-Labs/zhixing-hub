import { afterEach, describe, expect, it } from 'vitest';
import {
  MockCaptchaAdapter,
  MockIntegrationNotAllowedError,
  MockSmsAdapter,
} from './mock-integration.adapters';

describe('mock external integrations（《11》第 13.1 节）', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.INTEGRATION_MODE;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalMode === undefined) delete process.env.INTEGRATION_MODE;
    else process.env.INTEGRATION_MODE = originalMode;
  });

  it('开发环境提供可验证的 CAPTCHA 与调试短信码', async () => {
    process.env.NODE_ENV = 'development';
    process.env.INTEGRATION_MODE = 'mock';
    const captcha = new MockCaptchaAdapter();
    const challenge = await captcha.issueChallenge();

    await expect(captcha.verify(challenge.token)).resolves.toBe(true);
    await expect(captcha.verify('wrong')).resolves.toBe(false);
    await expect(
      new MockSmsAdapter().sendCode(
        '13800138000',
        '123456',
        'ACTIVATION',
      ),
    ).resolves.toMatchObject({ mock: true, debugCode: '123456' });
  });

  it('生产环境拒绝启动 Mock 调用', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INTEGRATION_MODE = 'mock';
    await expect(
      new MockCaptchaAdapter().issueChallenge(),
    ).rejects.toBeInstanceOf(MockIntegrationNotAllowedError);
  });
});
