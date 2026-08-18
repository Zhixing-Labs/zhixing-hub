import { generate } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRecoveryCodes,
  normalizeRecoveryCode,
} from './recovery-codes';
import { TotpCipher } from './totp-cipher';
import { TotpService } from './totp.service';

describe('platform TOTP（《07》第 5.4 节）', () => {
  const originalKey = process.env.TOTP_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.TOTP_ENCRYPTION_KEY;
    } else {
      process.env.TOTP_ENCRYPTION_KEY = originalKey;
    }
  });

  it('以 accountId 绑定的 AES-256-GCM 密文保存密钥', () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const cipher = new TotpCipher();
    const encrypted = cipher.encrypt('account-1', 'BASE32SECRET');

    expect(cipher.decrypt('account-1', encrypted)).toBe('BASE32SECRET');
    expect(() => cipher.decrypt('account-2', encrypted)).toThrow();
  });

  it('校验六位动态码并拒绝同时间步重放', async () => {
    const service = new TotpService();
    const enrollment = service.createEnrollment('super-admin');
    const token = await generate({ secret: enrollment.secret });
    const timeStep = await service.verify(enrollment.secret, token);

    expect(timeStep).toBeTypeOf('number');
    await expect(
      service.verify(enrollment.secret, token, timeStep ?? undefined),
    ).resolves.toBeNull();
  });

  it('生成十枚便于离线保存的一次性恢复码', () => {
    const codes = createRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(normalizeRecoveryCode(codes[0] ?? '')).toMatch(/^[A-Z0-9]{12}$/);
  });
});
