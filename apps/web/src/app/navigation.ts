import { AppointmentListQuerySchema, LocalDateSchema, UUIDSchema, type Role } from '@drlaudo/contract';

export function homeForRole(role: Role) {
  return role === 'STAFF' ? '/agenda' : '/meus-exames';
}
export function safeReturnTo(value: unknown, role: Role) {
  const home = homeForRole(role);
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return home;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return home;
    const params = Object.fromEntries(url.searchParams);
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) return home;
    if (role === 'STAFF') {
      if (url.pathname === '/agenda' && AppointmentListQuerySchema.safeParse(params).success) return url.pathname + url.search;
      if (url.pathname === '/agendamentos/novo' && Object.keys(params).every((key) => key === 'date') && (!params.date || LocalDateSchema.safeParse(params.date).success)) return url.pathname + url.search;
      const match = /^\/agendamentos\/([^/]+)\/laudo$/.exec(url.pathname);
      if (match?.[1] && UUIDSchema.safeParse(decodeURIComponent(match[1])).success && !url.search) return url.pathname;
    } else {
      if (url.pathname === '/meus-exames' && !url.search) return url.pathname;
      const match = /^\/meus-exames\/([^/]+)\/laudo$/.exec(url.pathname);
      if (match?.[1] && UUIDSchema.safeParse(decodeURIComponent(match[1])).success && !url.search) return url.pathname;
    }
  } catch { return home; }
  return home;
}
