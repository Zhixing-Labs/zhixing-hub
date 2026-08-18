import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher';

describe('password hashing（《11》第 8.2 节）', () => {
  const hasher = new PasswordHasher();

  it('使用 Argon2id 且可验证正确密码', async () => {
    const hash = await hasher.hash('Correct-Horse-Battery-Staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      hasher.verify(hash, 'Correct-Horse-Battery-Staple'),
    ).resolves.toBe(true);
  });

  it('拒绝错误密码', async () => {
    const hash = await hasher.hash('correct password');
    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
