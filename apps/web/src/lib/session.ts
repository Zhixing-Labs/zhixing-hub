const CSRF_STORAGE_KEY = 'zhixing.csrfToken';

export function getCsrfToken(): string {
  return sessionStorage.getItem(CSRF_STORAGE_KEY) ?? '';
}

export function setCsrfToken(token: string): void {
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

export function clearCsrfToken(): void {
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
}
