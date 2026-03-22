const ADMIN_SAFEGUARD_TOKEN_KEY = 'adminSafeguardToken';

export function getAdminSafeguardToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_SAFEGUARD_TOKEN_KEY);
}

export function setAdminSafeguardToken(token: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADMIN_SAFEGUARD_TOKEN_KEY, token);
}

export function clearAdminSafeguardToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_SAFEGUARD_TOKEN_KEY);
}