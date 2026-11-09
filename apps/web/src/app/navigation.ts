import { AppointmentListQuerySchema, UUIDSchema, type Role } from '@drlaudo/contract';

export function homeForRole(role: Role) {
  return role === 'STAFF' ? '/agenda' : '/meus-exames';
}
export function safeReturnTo(value: unknown, role: Role) {
  const home = homeForRole(role);
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return home;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.hash) return home;
    const params = Object.fromEntries(url.searchParams);
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) return home;
    if (role === 'STAFF') {
      const { focus, ...context } = params;
      if (url.pathname === '/agenda' && AppointmentListQuerySchema.safeParse(context).success
        && (focus === undefined || UUIDSchema.safeParse(focus).success)) return url.pathname + url.search;
      if (url.pathname === '/pacientes' && !url.search) return url.pathname;
      if (url.pathname === '/agendamentos/novo' && !url.searchParams.has('scope')
        && AppointmentListQuerySchema.safeParse(params).success) return url.pathname + url.search;
      const match = /^\/agendamentos\/([^/]+)\/laudo$/.exec(url.pathname);
      if (match?.[1] && UUIDSchema.safeParse(decodeURIComponent(match[1])).success
        && AppointmentListQuerySchema.safeParse(params).success) return url.pathname + url.search;
    } else {
      if (url.pathname === '/meus-exames' && !url.search) return url.pathname;
      const match = /^\/meus-exames\/([^/]+)\/laudo$/.exec(url.pathname);
      if (match?.[1] && UUIDSchema.safeParse(decodeURIComponent(match[1])).success && !url.search) return url.pathname;
    }
  } catch { return home; }
  return home;
}
