import { createHash, randomBytes } from 'node:crypto';

export interface SessionSecrets {
  token: string;
  tokenHash: string;
  csrfToken: string;
  csrfTokenHash: string;
}

export interface OpaqueSecret {
  secret: string;
  hash: string;
}

export function hashSessionSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function createOpaqueSecret(): OpaqueSecret {
  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: hashSessionSecret(secret) };
}

/** 明文令牌只返回给调用方，数据库仅保存 SHA-256 哈希（《11》第 8.1 节）。 */
export function createSessionSecrets(): SessionSecrets {
  const token = createOpaqueSecret();
  const csrfToken = createOpaqueSecret();

  return {
    token: token.secret,
    tokenHash: token.hash,
    csrfToken: csrfToken.secret,
    csrfTokenHash: csrfToken.hash,
  };
}
