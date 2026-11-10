import { AppointmentListQuerySchema, AppointmentStatusSchema, ReportStatusSchema, LocalDateSchema, UUIDSchema, type Role } from '@drlaudo/contract';
import { todayDate } from '../lib/time';

export function homeForRole(role: Role) {
  return role === 'STAFF' ? '/agenda' : '/meus-exames';
}
function internalUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.hash
      || new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) return null;
    return url;
  } catch { return null; }
}

function validAgendaContext(params: Record<string, string>): boolean {
  const { focus, view, calendarDate, appointmentStatus, reportStatus, ...context } = params;
  const filtersValid = (appointmentStatus === undefined || AppointmentStatusSchema.safeParse(appointmentStatus).success)
    && (reportStatus === undefined || reportStatus === 'NONE' || ReportStatusSchema.safeParse(reportStatus).success);
  const calendarContextValid = view === undefined && calendarDate === undefined
    || context.scope === 'all' && view === 'calendar' && LocalDateSchema.safeParse(calendarDate).success;
  return filtersValid && calendarContextValid && AppointmentListQuerySchema.safeParse(context).success
    && (focus === undefined || UUIDSchema.safeParse(focus).success);
}

function agendaReturnUrl(value: unknown): URL | null {
  const url = internalUrl(value);
  return url?.pathname === '/agenda' && validAgendaContext(Object.fromEntries(url.searchParams)) ? url : null;
}

export function appointmentCreationHref(context: string): string {
  const origin = agendaReturnUrl(context);
  const returnTo = origin ? origin.pathname + origin.search : '/agenda';
  const patientId = origin?.searchParams.get('patientId');
  const params = new URLSearchParams({
    date: origin?.searchParams.get('calendarDate') ?? origin?.searchParams.get('date') ?? todayDate(),
    ...(patientId ? { patientId } : {}),
    returnTo,
  });
  return `/agendamentos/novo?${params}`;
}

function validIdSegment(value: string | undefined): boolean {
  try { return value !== undefined && UUIDSchema.safeParse(decodeURIComponent(value)).success; }
  catch { return false; }
}

export function safeReturnTo(value: unknown, role: Role) {
  const home = homeForRole(role);
  const url = internalUrl(value);
  if (!url) return home;
  const params = Object.fromEntries(url.searchParams);
  if (role === 'STAFF') {
    const agendaContextValid = validAgendaContext(params);
    if (url.pathname === '/agenda' && agendaContextValid) return url.pathname + url.search;
    if (url.pathname === '/pacientes' && !url.search) return url.pathname;
    const { returnTo, ...creationContext } = params;
    if (url.pathname === '/agendamentos/novo' && !url.searchParams.has('scope')
      && AppointmentListQuerySchema.safeParse(creationContext).success
      && (returnTo === undefined || agendaReturnUrl(returnTo) !== null)) return url.pathname + url.search;
    const match = /^\/agendamentos\/([^/]+)\/laudo$/.exec(url.pathname);
    if (validIdSegment(match?.[1])
      && !url.searchParams.has('focus') && agendaContextValid) return url.pathname + url.search;
  } else {
    if (url.pathname === '/meus-exames' && !url.search) return url.pathname;
    const match = /^\/meus-exames\/([^/]+)\/laudo$/.exec(url.pathname);
    if (validIdSegment(match?.[1]) && !url.search) return url.pathname;
  }
  return home;
}
