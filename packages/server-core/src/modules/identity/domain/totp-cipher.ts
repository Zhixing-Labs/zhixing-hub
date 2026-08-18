import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

export interface EncryptedTotpSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export class InvalidTotpEncryptionKeyError extends Error {
  constructor() {
    super('TOTP_ENCRYPTION_KEY must be a Base64-encoded 32-byte key');
    this.name = 'InvalidTotpEncryptionKeyError';
  }
}

/** TOTP 密钥使用 AES-256-GCM 加密，accountId 作为附加认证数据。 */
@Injectable()
export class TotpCipher {
  encrypt(accountId: string, secret: string): EncryptedTotpSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', readEncryptionKey(), iv);
    cipher.setAAD(Buffer.from(accountId, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext,
      iv,
      authTag: cipher.getAuthTag(),
    };
  }

  decrypt(
    accountId: string,
    encrypted: EncryptedTotpSecret,
  ): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      readEncryptionKey(),
      encrypted.iv,
    );
    decipher.setAAD(Buffer.from(accountId, 'utf8'));
    decipher.setAuthTag(encrypted.authTag);
    return Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}

function readEncryptionKey(): Buffer {
  const encoded = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new InvalidTotpEncryptionKeyError();
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new InvalidTotpEncryptionKeyError();
  }
  return key;
}
