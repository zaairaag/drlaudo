import { JwtClaimsSchema, LoginResponseSchema, type LoginResponse } from '@drlaudo/contract';

export const SESSION_STORAGE_KEY = 'drlaudo.session';
export const SESSION_EXPIRED_NOTICE = 'Sua sessão expirou. Entre novamente.';

// Decoding is only for the expiry UX. Neither this nor the development mock
// verifies a signature; /auth/me and the real API are the authentication boundary.
export function sessionExpiresAt(session: LoginResponse): number | null {
  try {
    const payload = session.token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const claims = JwtClaimsSchema.safeParse(decoded);
    if (!claims.success || claims.data.sub !== session.user.id || claims.data.role !== session.user.role) return null;
    return claims.data.exp * 1000;
  } catch {
    return null;
  }
}
export function parseStoredSession(value: string): LoginResponse | null {
  try {
    const decoded: unknown = JSON.parse(value);
    const parsed = LoginResponseSchema.safeParse(decoded);
    if (!parsed.success) return null;
    const expiresAt = sessionExpiresAt(parsed.data);
    return expiresAt !== null && Date.now() < expiresAt ? parsed.data : null;
  } catch {
    return null;
  }
}
