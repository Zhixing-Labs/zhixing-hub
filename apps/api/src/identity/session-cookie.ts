const DEFAULT_COOKIE_NAME = 'zhixing_session';

export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const targetName = sessionCookieName();
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    if (name === targetName) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

export function createSessionCookie(
  token: string,
  expiresAt: Date,
): string {
  const attributes = [
    `${sessionCookieName()}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function clearSessionCookie(): string {
  const attributes = [
    `${sessionCookieName()}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}
