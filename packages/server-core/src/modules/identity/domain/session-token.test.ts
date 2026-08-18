import { describe, expect, it } from 'vitest';
import { createSessionSecrets, hashSessionSecret } from './session-token';

describe('opaque session token（《11》第 8.1 节）', () => {
  it('生成 256 bit 随机令牌并只暴露固定长度哈希', () => {
    const secrets = createSessionSecrets();

    expect(Buffer.from(secrets.token, 'base64url')).toHaveLength(32);
    expect(Buffer.from(secrets.csrfToken, 'base64url')).toHaveLength(32);
    expect(secrets.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secrets.csrfTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('同一明文稳定映射到同一哈希', () => {
    const secrets = createSessionSecrets();
    expect(hashSessionSecret(secrets.token)).toBe(secrets.tokenHash);
  });

  it('每次生成的令牌互不相同', () => {
    const first = createSessionSecrets();
    const second = createSessionSecrets();

    expect(first.token).not.toBe(second.token);
    expect(first.csrfToken).not.toBe(second.csrfToken);
  });
});
