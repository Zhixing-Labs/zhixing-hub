import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { PasswordHasher } from './modules/identity/domain/password-hasher';
import {
  createRecoveryCodes,
  normalizeRecoveryCode,
} from './modules/identity/domain/recovery-codes';
import { TotpCipher } from './modules/identity/domain/totp-cipher';
import { TotpService } from './modules/identity/domain/totp.service';

loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const PLATFORM_TENANT_ID = '00000000-0000-4000-8000-000000000001';

async function bootstrapSuperAdmin(): Promise<void> {
  const username = requireEnvironment('BOOTSTRAP_SUPER_ADMIN_USERNAME');
  const password = requireEnvironment('BOOTSTRAP_SUPER_ADMIN_PASSWORD');
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new Error(
      'BOOTSTRAP_SUPER_ADMIN_USERNAME must be 3-64 ASCII letters, digits, dot, underscore, or hyphen',
    );
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 12 characters');
  }

  const prisma = new PrismaService();
  const passwordHasher = new PasswordHasher();
  const totp = new TotpService();
  const cipher = new TotpCipher();
  await prisma.$connect();

  try {
    const existing = await prisma.membership.findFirst({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      include: { account: true },
    });
    if (existing) {
      throw new Error(
        `Active super admin already exists: ${existing.account.username ?? existing.account.id}`,
      );
    }

    const accountId = randomUUID();
    const enrollment = totp.createEnrollment(username);
    const encrypted = cipher.encrypt(accountId, enrollment.secret);
    const passwordHash = await passwordHasher.hash(password);
    const recoveryCodes = createRecoveryCodes();
    const recoveryCodeHashes: string[] = [];
    for (const recoveryCode of recoveryCodes) {
      recoveryCodeHashes.push(
        await passwordHasher.hash(normalizeRecoveryCode(recoveryCode)),
      );
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.tenant.upsert({
        where: { id: PLATFORM_TENANT_ID },
        create: {
          id: PLATFORM_TENANT_ID,
          type: 'PLATFORM',
          name: '知行工坊平台',
        },
        update: {
          name: '知行工坊平台',
          status: 'ACTIVE',
        },
      });

      await transaction.account.create({
        data: {
          id: accountId,
          kind: 'PLATFORM_ADMIN',
          username,
          phone: null,
          passwordHash,
          displayName: '平台超级管理员',
          status: 'ACTIVE',
          profileCompletedAt: new Date(),
          membership: {
            create: {
              tenantId: PLATFORM_TENANT_ID,
              role: 'SUPER_ADMIN',
            },
          },
          totpCredential: {
            create: {
              secretCiphertext: Uint8Array.from(encrypted.ciphertext),
              secretIv: Uint8Array.from(encrypted.iv),
              secretAuthTag: Uint8Array.from(encrypted.authTag),
              enabledAt: new Date(),
            },
          },
          totpRecoveryCodes: {
            create: recoveryCodeHashes.map((codeHash) => ({ codeHash })),
          },
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: PLATFORM_TENANT_ID,
          actorAccountId: accountId,
          action: 'platform.super_admin.bootstrapped',
          targetType: 'account',
          targetId: accountId,
          after: { username, role: 'SUPER_ADMIN', phoneBound: false },
        },
      });
    });

    process.stdout.write(
      [
        '',
        'Super admin created. Save the following material offline now.',
        `Username: ${username}`,
        `TOTP secret: ${enrollment.secret}`,
        `TOTP URI: ${enrollment.uri}`,
        'Recovery codes (each can be used once):',
        ...recoveryCodes.map((code) => `  ${code}`),
        '',
        'Remove BOOTSTRAP_SUPER_ADMIN_PASSWORD from the environment after verification.',
        '',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

void bootstrapSuperAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
