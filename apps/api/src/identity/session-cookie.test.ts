import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  createSessionCookie,
  readSessionToken,
} from './session-cookie';

describe('session cookie（《11》第 8.1 节）', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('从多个 Cookie 中读取会话令牌', () => {
    expect(readSessionToken('theme=dark; zhixing_session=a%2Fb; locale=zh')).toBe(
      'a/b',
    );
  });

  it('开发环境设置 HttpOnly、SameSite 与过期时间', () => {
    const value = createSessionCookie(
      'secret',
      new Date('2026-08-18T06:00:00.000Z'),
    );

    expect(value).toContain('zhixing_session=secret');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).not.toContain('Secure');
  });

  it('生产环境强制 Secure，清除时立即过期', () => {
    process.env.NODE_ENV = 'production';
    expect(createSessionCookie('secret', new Date())).toContain('Secure');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});
