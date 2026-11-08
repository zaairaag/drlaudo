import {
  CLINIC_TZ,
  ExamTypeListResponseSchema,
  isPast,
  isValidSlot,
  LocalDateSchema,
  localDayRange,
  defaultAgendaRange,
  generateDaySlots,
  MyAppointmentListResponseSchema,
  PatientListResponseSchema,
  PublishedPatientReportSchema,
  SlotsResponseSchema,
  StaffAppointmentListResponseSchema,
  StaffAppointmentSchema,
  StaffReportSchema,
  UUIDSchema,
  type Role,
  type User,
  type ValidationIssue,
} from '@drlaudo/contract';
import { http, type HttpHandler } from 'msw/http';
import { delay } from 'msw/utils/delay';
import type { MockAppointment, MockDb, MockReport } from './db.js';
import { mockRuntime } from './runtime.js';
import {
  createIssue,
  errorResponse,
  jsonResponse,
  notFoundResponse,
  validationErrorResponse,
} from './validation.js';
export interface Clock {
  now: () => Date;
}
interface HandlersOptions {
  db: MockDb;
  clock: Clock;
  latency?: number;
}

interface SimulatedTokenClaims {
  sub: string;
  role: Role;
  name: string;
  iss: 'drlaudo-api';
  iat: number;
  exp: number;
}

const SIGNATURE_SALT = 'drlaudo-mock-auth-simulation-salt';

function toBase64Url(value: string): string {
  const base64 = btoa(value);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return atob(base64);
}

function computeSignature(payloadB64: string): string {
  let hash = 0;
  const input = `${payloadB64}.${SIGNATURE_SALT}`;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return toBase64Url(String(hash));
}

function generateSimulatedToken(user: User, clock: Clock): string {
  const iat = Math.floor(clock.now().getTime() / 1000);
  const exp = iat + 28800;
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify({
    sub: user.id,
    role: user.role,
    name: user.name,
    iss: 'drlaudo-api',
    iat,
    exp,
  } satisfies SimulatedTokenClaims));
  const sigB64 = computeSignature(payloadB64);
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

function authenticateRequest(request: Request, db: MockDb, clock: Clock, nowIso?: string): { ok: true; user: User } | { ok: false; response: Response } {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  if (!authHeader.startsWith('Bearer ')) return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  const [, payloadB64, sigB64] = parts;
  if (computeSignature(payloadB64) !== sigB64) {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  let claims: SimulatedTokenClaims;
  try {
    claims = JSON.parse(fromBase64Url(payloadB64));
  } catch {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  if (claims.iss !== 'drlaudo-api' || claims.exp !== claims.iat + 28800) {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  const nowSec = (nowIso ? new Date(nowIso).getTime() : clock.now().getTime()) / 1000;
  if (nowSec >= claims.exp) {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  const user = db.users.find((u) => u.id === claims.sub);
  if (!user || user.role !== claims.role || user.name !== claims.name) {
    return { ok: false, response: errorResponse('UNAUTHORIZED', 401) };
  }
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

function compareStringsByCodePoint(a: string, b: string): number {
  if (a === b) return 0;
  const itA = a[Symbol.iterator]();
  const itB = b[Symbol.iterator]();
  while (true) {
    const nA = itA.next();
    const nB = itB.next();
    if (nA.done && nB.done) return 0;
    if (nA.done) return -1;
    if (nB.done) return 1;
    const cpA = nA.value.codePointAt(0)!;
    const cpB = nB.value.codePointAt(0)!;
    if (cpA !== cpB) return cpA - cpB;
  }
}

function toStaffReportDto(report: MockReport) {
  return {
    id: report.id,
    appointmentId: report.appointmentId,
    title: report.title,
    body: report.body,
    professionalName: report.professionalName,
    status: report.status,
    publishedAt: report.publishedAt,
    updatedAt: report.updatedAt,
  };
}

interface QueryValidationSpec {
  allowed: string[];
  required?: string[];
}

function parseAndValidateQuery(urlStr: string, spec: QueryValidationSpec): { ok: true; params: Record<string, string> } | { ok: false; issues: ValidationIssue[] } {
  const url = new URL(urlStr);
  const issues: ValidationIssue[] = [];
  const search = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const seenKeys = new Map<string, number>();
  const parsedParams: Record<string, string> = {};

  if (search.length > 0) {
    const pairs = search.split('&');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
      const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
      const key = decodeURIComponent(rawKey);
      const val = decodeURIComponent(rawVal);
      seenKeys.set(key, (seenKeys.get(key) ?? 0) + 1);
      parsedParams[key] = val;
    }
  }

  for (const [key, count] of seenKeys.entries()) {
    if (count > 1) {
      issues.push(createIssue('query', [key], 'DUPLICATE_QUERY'));
    } else if (!spec.allowed.includes(key)) {
      issues.push(createIssue('query', [key], 'UNKNOWN_FIELD'));
    }
  }

  if (spec.required) {
    for (const req of spec.required) {
      if (!seenKeys.has(req)) {
        issues.push(createIssue('query', [req], 'REQUIRED'));
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, params: parsedParams };
}

async function validateNoBody(request: Request): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const text = await request.clone().text();
  if (text.length > 0) {
    issues.push(createIssue('body', [], 'UNEXPECTED_BODY'));
  }
  return issues;
}

interface LoginRateLimiter {
  check(nowMs: number): { allowed: true } | { allowed: false; retryAfterSec: number };
}

function createRateLimiter(): LoginRateLimiter {
  let windowStart = 0;
  let attempts = 0;
  return {
    check(nowMs: number) {
      if (windowStart === 0 || nowMs >= windowStart + 60000) {
        windowStart = nowMs;
        attempts = 1;
        return { allowed: true };
      }
      attempts += 1;
      if (attempts > 10) {
        const remaining = Math.max(1, Math.ceil((windowStart + 60000 - nowMs) / 1000));
        return { allowed: false, retryAfterSec: remaining };
      }
      return { allowed: true };
    },
  };
}

export function createHandlers({ db, clock, latency }: HandlersOptions): HttpHandler[] {
  const loginLimiter = createRateLimiter();

  async function applyLatency(): Promise<void> {
    if (latency !== undefined) {
      if (latency > 0) await delay(latency);
      return;
    }
    const snap = mockRuntime.getSnapshot();
    if (snap.slow) {
      await delay(1200);
    } else {
      const demo = Math.floor(Math.random() * 301) + 300;
      await delay(demo);
    }
  }

  function checkRuntimeFaults(): Response | null {
    if (db.snapshotStatus === 'invalid') {
      return errorResponse('INTERNAL_ERROR', 500);
    }
    if (mockRuntime.getSnapshot().error500) {
      return errorResponse('INTERNAL_ERROR', 500);
    }
    return null;
  }

  return [
    // 1. GET /api/health
    http.get('*/api/health', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const allIssues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];
      if (allIssues.length > 0) return validationErrorResponse(allIssues);

      return jsonResponse({ status: 'ok', db: 'ok' });
    }),

    // 2. POST /api/auth/login
    http.post('*/api/auth/login', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const limitCheck = loginLimiter.check(clock.now().getTime());
      if (!limitCheck.allowed) {
        const headers = new Headers();
        headers.set('Retry-After', String(limitCheck.retryAfterSec));
        return errorResponse('RATE_LIMITED', 429, headers);
      }

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const issues = [...(qResult.ok ? [] : qResult.issues)];

      const rawBody = await request.clone().text();
      let parsedBody: unknown = undefined;
      let bodyParsed = false;
      if (rawBody.trim().length === 0) {
        issues.push(createIssue('body', [], 'REQUIRED'));
      } else {
        const ct = request.headers.get('content-type') ?? '';
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct)) {
          issues.push(createIssue('body', [], 'INVALID_FORMAT'));
        } else {
          try {
            parsedBody = JSON.parse(rawBody);
            bodyParsed = true;
          } catch {
            issues.push(createIssue('body', [], 'INVALID_JSON'));
          }
        }
      }

      if (bodyParsed) {
        if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
          issues.push(createIssue('body', [], 'INVALID_TYPE'));
        } else {
          const bodyObj = parsedBody as Record<string, unknown>;
          for (const key of Object.keys(bodyObj)) {
            if (key !== 'email' && key !== 'password') {
              issues.push(createIssue('body', [key], 'UNKNOWN_FIELD'));
            }
          }
          if (bodyObj['email'] === undefined) {
            issues.push(createIssue('body', ['email'], 'REQUIRED'));
          } else if (typeof bodyObj['email'] !== 'string') {
            issues.push(createIssue('body', ['email'], 'INVALID_TYPE'));
          } else {
            const emailStr = bodyObj['email'];
            const trimmed = emailStr.trim().toLowerCase();
            if (trimmed.length === 0) {
              issues.push(createIssue('body', ['email'], 'TOO_SHORT'));
            } else if (emailStr.trim().length > 254) {
              issues.push(createIssue('body', ['email'], 'TOO_LONG'));
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
              issues.push(createIssue('body', ['email'], 'INVALID_FORMAT'));
            }
          }
          if (bodyObj['password'] === undefined) {
            issues.push(createIssue('body', ['password'], 'REQUIRED'));
          } else if (typeof bodyObj['password'] !== 'string') {
            issues.push(createIssue('body', ['password'], 'INVALID_TYPE'));
          } else {
            const passStr = bodyObj['password'];
            if (passStr.length === 0) {
              issues.push(createIssue('body', ['password'], 'TOO_SHORT'));
            }
          }
        }
      }
      if (issues.length > 0) return validationErrorResponse(issues);
      const loginBody = parsedBody as Record<string, unknown>;
      const emailNorm = (loginBody['email'] as string).trim().toLowerCase();
      const password = loginBody['password'] as string;
      const user = db.users.find((u) => u.email.toLowerCase() === emailNorm && u.password === password);
      if (!user) return errorResponse('UNAUTHORIZED', 401);

      const token = generateSimulatedToken(user, clock);
      return jsonResponse({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }),

    // 3. GET /api/auth/me
    http.get('*/api/auth/me', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const allIssues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];
      if (allIssues.length > 0) return validationErrorResponse(allIssues);

      return jsonResponse(auth.user);
    }),

    // 4. GET /api/patients
    http.get('*/api/patients', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const allIssues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];
      if (allIssues.length > 0) return validationErrorResponse(allIssues);

      const patients = db.users
        .filter((u) => u.role === 'PATIENT')
        .map((u) => ({ id: u.id, name: u.name, email: u.email }))
        .sort((a, b) => {
          const cmp = compareStringsByCodePoint(a.name, b.name);
          return cmp !== 0 ? cmp : compareStringsByCodePoint(a.id, b.id);
        });

      const parsed = PatientListResponseSchema.safeParse(patients);
      if (!parsed.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(parsed.data);
    }),

    // 5. GET /api/exam-types
    http.get('*/api/exam-types', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const allIssues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];
      if (allIssues.length > 0) return validationErrorResponse(allIssues);

      const examTypes = [...db.examTypes].sort((a, b) => {
        const cmp = compareStringsByCodePoint(a.name, b.name);
        return cmp !== 0 ? cmp : compareStringsByCodePoint(a.id, b.id);
      });

      const parsed = ExamTypeListResponseSchema.safeParse(examTypes);
      if (!parsed.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(parsed.data);
    }),

    // 6. GET /api/slots?date=YYYY-MM-DD
    http.get('*/api/slots', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const now = clock.now().toISOString();
      const auth = authenticateRequest(request, db, clock, now);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: ['date'], required: ['date'] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      let validDate: string | null = null;
      if (qResult.ok && qResult.params['date']) {
        const dateParsed = LocalDateSchema.safeParse(qResult.params['date']);
        if (!dateParsed.success) {
          issues.push(createIssue('query', ['date'], 'INVALID_FORMAT'));
        } else {
          validDate = dateParsed.data;
        }
      }

      if (issues.length > 0) return validationErrorResponse(issues);


      const slotInstants = generateDaySlots(validDate!);
      const activeStarts = new Set(
        db.appointments
          .filter((a) => a.status === 'SCHEDULED')
          .map((a) => a.startsAt),
      );

      const slots = slotInstants.map((startsAt) => {
        if (isPast(startsAt, now)) {
          return { startsAt, available: false as const, reason: 'PAST' as const };
        }
        if (activeStarts.has(startsAt)) {
          return { startsAt, available: false as const, reason: 'TAKEN' as const };
        }
        return { startsAt, available: true as const };
      });

      const payload = {
        date: validDate!,
        timezone: CLINIC_TZ,
        slots,
      };

      const parsed = SlotsResponseSchema.safeParse(payload);
      if (!parsed.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(parsed.data);
    }),

    // 7. POST /api/appointments
    http.post('*/api/appointments', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const issues = [...(qResult.ok ? [] : qResult.issues)];

      const rawBody = await request.clone().text();
      let parsedBody: Record<string, unknown> | null = null;
      if (rawBody.trim().length === 0) {
        issues.push(createIssue('body', [], 'REQUIRED'));
      } else {
        const ct = request.headers.get('content-type') ?? '';
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct)) {
          issues.push(createIssue('body', [], 'INVALID_FORMAT'));
        } else {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            issues.push(createIssue('body', [], 'INVALID_JSON'));
          }
        }
      }

      let patientIdVal: string | null = null;
      let examTypeIdVal: string | null = null;
      let startsAtVal: string | null = null;

      if (parsedBody !== null) {
        if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
          issues.push(createIssue('body', [], 'INVALID_TYPE'));
        } else {
          for (const key of Object.keys(parsedBody)) {
            if (key !== 'patientId' && key !== 'examTypeId' && key !== 'startsAt') {
              issues.push(createIssue('body', [key], 'UNKNOWN_FIELD'));
            }
          }
          if (parsedBody['patientId'] === undefined) {
            issues.push(createIssue('body', ['patientId'], 'REQUIRED'));
          } else if (typeof parsedBody['patientId'] !== 'string') {
            issues.push(createIssue('body', ['patientId'], 'INVALID_TYPE'));
          } else {
            const parsed = UUIDSchema.safeParse(parsedBody['patientId']);
            if (!parsed.success) issues.push(createIssue('body', ['patientId'], 'INVALID_FORMAT'));
            else patientIdVal = parsed.data;
          }

          if (parsedBody['examTypeId'] === undefined) {
            issues.push(createIssue('body', ['examTypeId'], 'REQUIRED'));
          } else if (typeof parsedBody['examTypeId'] !== 'string') {
            issues.push(createIssue('body', ['examTypeId'], 'INVALID_TYPE'));
          } else {
            const parsed = UUIDSchema.safeParse(parsedBody['examTypeId']);
            if (!parsed.success) issues.push(createIssue('body', ['examTypeId'], 'INVALID_FORMAT'));
            else examTypeIdVal = parsed.data;
          }

          if (parsedBody['startsAt'] === undefined) {
            issues.push(createIssue('body', ['startsAt'], 'REQUIRED'));
          } else if (typeof parsedBody['startsAt'] !== 'string') {
            issues.push(createIssue('body', ['startsAt'], 'INVALID_TYPE'));
          } else {
            const val = parsedBody['startsAt'];
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(val)) {
              issues.push(createIssue('body', ['startsAt'], 'INVALID_FORMAT'));
            } else {
              const d = new Date(val);
              if (isNaN(d.getTime()) || d.toISOString() !== val) {
                issues.push(createIssue('body', ['startsAt'], 'INVALID_FORMAT'));
              } else {
                startsAtVal = val;
              }
            }
          }
        }
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const patient = db.users.find((u) => u.id === patientIdVal && u.role === 'PATIENT');
      const examType = db.examTypes.find((e) => e.id === examTypeIdVal);
      if (!patient || !examType) return errorResponse('NOT_FOUND', 404);

      if (!isValidSlot(startsAtVal!)) return errorResponse('INVALID_SLOT', 422);

      const now = clock.now().toISOString();
      if (isPast(startsAtVal!, now)) return errorResponse('PAST_DATE', 422);

      const isTaken = db.appointments.some((a) => a.startsAt === startsAtVal && a.status === 'SCHEDULED');
      if (isTaken) return errorResponse('SLOT_TAKEN', 409);

      const newId = crypto.randomUUID();
      const appointment: MockAppointment = {
        id: newId,
        patientId: patient.id,
        examTypeId: examType.id,
        startsAt: startsAtVal!,
        status: 'SCHEDULED',
        createdAt: now,
        canceledAt: null,
      };

      const dto = {
        id: appointment.id,
        startsAt: appointment.startsAt,
        status: appointment.status,
        patient: { id: patient.id, name: patient.name },
        examType: { id: examType.id, name: examType.name },
        report: null,
      };

      const validatedOutput = StaffAppointmentSchema.safeParse(dto);
      if (!validatedOutput.success) return errorResponse('INTERNAL_ERROR', 500);

      db.appointments.push(appointment);
      db.persist();

      return jsonResponse(validatedOutput.data, 201);
    }),

    // 8. GET /api/appointments
    http.get('*/api/appointments', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: ['date', 'patientId'] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      let filterDate: string | undefined;
      let filterPatientId: string | undefined;

      if (qResult.ok) {
        if (qResult.params['date']) {
          const parsed = LocalDateSchema.safeParse(qResult.params['date']);
          if (!parsed.success) issues.push(createIssue('query', ['date'], 'INVALID_FORMAT'));
          else filterDate = parsed.data;
        }
        if (qResult.params['patientId']) {
          const parsed = UUIDSchema.safeParse(qResult.params['patientId']);
          if (!parsed.success) issues.push(createIssue('query', ['patientId'], 'INVALID_FORMAT'));
          else filterPatientId = parsed.data;
        }
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const now = clock.now().toISOString();
      let rangeFrom: string;
      let rangeTo: string;

      if (filterDate) {
        const range = localDayRange(filterDate);
        rangeFrom = range.from.toISOString();
        rangeTo = range.to.toISOString();
      } else {
        const range = defaultAgendaRange(now);
        rangeFrom = range.from.toISOString();
        rangeTo = range.to.toISOString();
      }

      if (filterPatientId) {
        const patientExists = db.users.some((u) => u.id === filterPatientId && u.role === 'PATIENT');
        if (!patientExists) return jsonResponse([]);
      }

      const filtered = db.appointments.filter((a) => {
        if (a.startsAt < rangeFrom || a.startsAt >= rangeTo) return false;
        if (filterPatientId && a.patientId !== filterPatientId) return false;
        return true;
      });

      filtered.sort((a, b) => {
        const cmp = compareStringsByCodePoint(a.startsAt, b.startsAt);
        return cmp !== 0 ? cmp : compareStringsByCodePoint(a.id, b.id);
      });

      const dtoList = filtered.map((a) => {
        const patient = db.users.find((u) => u.id === a.patientId)!;
        const examType = db.examTypes.find((e) => e.id === a.examTypeId)!;
        const report = db.reports.find((r) => r.appointmentId === a.id);
        return {
          id: a.id,
          startsAt: a.startsAt,
          status: a.status,
          patient: { id: patient.id, name: patient.name },
          examType: { id: examType.id, name: examType.name },
          report: report ? { id: report.id, status: report.status } : null,
        };
      });

      const validated = StaffAppointmentListResponseSchema.safeParse(dtoList);
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(validated.data);
    }),

    // 9. GET /api/appointments/:id
    http.get('*/api/appointments/:id', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const appointment = db.appointments.find((a) => a.id === idParsed.data);
      if (!appointment) return errorResponse('NOT_FOUND', 404);

      const patient = db.users.find((u) => u.id === appointment.patientId)!;
      const examType = db.examTypes.find((e) => e.id === appointment.examTypeId)!;
      const report = db.reports.find((r) => r.appointmentId === appointment.id);

      const dto = {
        id: appointment.id,
        startsAt: appointment.startsAt,
        status: appointment.status,
        patient: { id: patient.id, name: patient.name },
        examType: { id: examType.id, name: examType.name },
        report: report ? { id: report.id, status: report.status } : null,
      };

      const validated = StaffAppointmentSchema.safeParse(dto);
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(validated.data);
    }),

    // 10. POST /api/appointments/:id/cancel
    http.post('*/api/appointments/:id/cancel', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const appointment = db.appointments.find((a) => a.id === idParsed.data);
      if (!appointment) return errorResponse('NOT_FOUND', 404);

      if (appointment.status === 'CANCELED') return errorResponse('CANNOT_CANCEL', 409);

      const report = db.reports.find((r) => r.appointmentId === appointment.id);
      if (report && report.status === 'PUBLISHED') return errorResponse('CANNOT_CANCEL', 409);

      const now = clock.now().toISOString();
      appointment.status = 'CANCELED';
      appointment.canceledAt = now;

      const patient = db.users.find((u) => u.id === appointment.patientId)!;
      const examType = db.examTypes.find((e) => e.id === appointment.examTypeId)!;

      const dto = {
        id: appointment.id,
        startsAt: appointment.startsAt,
        status: appointment.status,
        patient: { id: patient.id, name: patient.name },
        examType: { id: examType.id, name: examType.name },
        report: report ? { id: report.id, status: report.status } : null,
      };

      const validated = StaffAppointmentSchema.safeParse(dto);
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);

      db.persist();
      return jsonResponse(validated.data);
    }),

    // 11. POST /api/appointments/:id/report
    http.post('*/api/appointments/:id/report', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const issues = [...(qResult.ok ? [] : qResult.issues)];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      const rawBody = await request.clone().text();
      let parsedBody: Record<string, unknown> | null = null;
      if (rawBody.trim().length === 0) {
        issues.push(createIssue('body', [], 'REQUIRED'));
      } else {
        const ct = request.headers.get('content-type') ?? '';
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct)) {
          issues.push(createIssue('body', [], 'INVALID_FORMAT'));
        } else {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            issues.push(createIssue('body', [], 'INVALID_JSON'));
          }
        }
      }

      let titleVal: string | null = null;
      let bodyVal: string | null = null;
      let profNameVal: string | null = null;

      if (parsedBody !== null) {
        if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
          issues.push(createIssue('body', [], 'INVALID_TYPE'));
        } else {
          for (const key of Object.keys(parsedBody)) {
            if (key !== 'title' && key !== 'body' && key !== 'professionalName') {
              issues.push(createIssue('body', [key], 'UNKNOWN_FIELD'));
            }
          }

          if (parsedBody['title'] === undefined) {
            issues.push(createIssue('body', ['title'], 'REQUIRED'));
          } else if (typeof parsedBody['title'] !== 'string') {
            issues.push(createIssue('body', ['title'], 'INVALID_TYPE'));
          } else {
            const trimmed = parsedBody['title'].trim();
            if (trimmed.length < 3) issues.push(createIssue('body', ['title'], 'TOO_SHORT'));
            else if (trimmed.length > 120) issues.push(createIssue('body', ['title'], 'TOO_LONG'));
            else titleVal = trimmed;
          }

          if (parsedBody['body'] === undefined) {
            issues.push(createIssue('body', ['body'], 'REQUIRED'));
          } else if (typeof parsedBody['body'] !== 'string') {
            issues.push(createIssue('body', ['body'], 'INVALID_TYPE'));
          } else {
            const trimmed = parsedBody['body'].trim();
            if (trimmed.length < 10) issues.push(createIssue('body', ['body'], 'TOO_SHORT'));
            else if (trimmed.length > 10000) issues.push(createIssue('body', ['body'], 'TOO_LONG'));
            else bodyVal = trimmed;
          }

          if (parsedBody['professionalName'] === undefined) {
            issues.push(createIssue('body', ['professionalName'], 'REQUIRED'));
          } else if (typeof parsedBody['professionalName'] !== 'string') {
            issues.push(createIssue('body', ['professionalName'], 'INVALID_TYPE'));
          } else {
            const trimmed = parsedBody['professionalName'].trim();
            if (trimmed.length < 3) issues.push(createIssue('body', ['professionalName'], 'TOO_SHORT'));
            else if (trimmed.length > 120) issues.push(createIssue('body', ['professionalName'], 'TOO_LONG'));
            else profNameVal = trimmed;
          }
        }
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const appointment = db.appointments.find((a) => a.id === idParsed.data);
      if (!appointment) return errorResponse('NOT_FOUND', 404);

      if (appointment.status === 'CANCELED') return errorResponse('APPOINTMENT_CANCELED', 409);

      const existingReport = db.reports.find((r) => r.appointmentId === appointment.id);
      if (existingReport) return errorResponse('REPORT_EXISTS', 409);

      const now = clock.now().toISOString();
      const report: MockReport = {
        id: crypto.randomUUID(),
        appointmentId: appointment.id,
        title: titleVal!,
        body: bodyVal!,
        professionalName: profNameVal!,
        status: 'DRAFT',
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const validated = StaffReportSchema.safeParse(toStaffReportDto(report));
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);

      db.reports.push(report);
      db.persist();

      return jsonResponse(validated.data, 201);
    }),

    // 12. GET /api/appointments/:id/report
    http.get('*/api/appointments/:id/report', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const appointment = db.appointments.find((a) => a.id === idParsed.data);
      if (!appointment) return errorResponse('NOT_FOUND', 404);

      const report = db.reports.find((r) => r.appointmentId === appointment.id);
      if (!report) return errorResponse('NOT_FOUND', 404);

      const validated = StaffReportSchema.safeParse(toStaffReportDto(report));
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(validated.data);
    }),

    // 13. PATCH /api/reports/:id
    http.patch('*/api/reports/:id', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const issues = [...(qResult.ok ? [] : qResult.issues)];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      const rawBody = await request.clone().text();
      let parsedBody: unknown = undefined;
      let bodyParsed = false;
      if (rawBody.trim().length === 0) {
        issues.push(createIssue('body', [], 'REQUIRED'));
      } else {
        const ct = request.headers.get('content-type') ?? '';
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct)) {
          issues.push(createIssue('body', [], 'INVALID_FORMAT'));
        } else {
          try {
            parsedBody = JSON.parse(rawBody);
            bodyParsed = true;
          } catch {
            issues.push(createIssue('body', [], 'INVALID_JSON'));
          }
        }
      }

      let patchTitle: string | undefined;
      let patchBody: string | undefined;
      let patchProf: string | undefined;

      if (bodyParsed) {
        if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
          issues.push(createIssue('body', [], 'INVALID_TYPE'));
        } else {
          const bodyObj = parsedBody as Record<string, unknown>;
          for (const key of Object.keys(bodyObj)) {
            if (key !== 'title' && key !== 'body' && key !== 'professionalName') {
              issues.push(createIssue('body', [key], 'UNKNOWN_FIELD'));
            }
          }

          const hasAllowed = ('title' in bodyObj) || ('body' in bodyObj) || ('professionalName' in bodyObj);
          if (!hasAllowed) {
            issues.push(createIssue('body', [], 'EMPTY_PATCH'));
          }

          if ('title' in bodyObj) {
            if (typeof bodyObj['title'] !== 'string') {
              issues.push(createIssue('body', ['title'], 'INVALID_TYPE'));
            } else {
              const trimmed = bodyObj['title'].trim();
              if (trimmed.length < 3) issues.push(createIssue('body', ['title'], 'TOO_SHORT'));
              else if (trimmed.length > 120) issues.push(createIssue('body', ['title'], 'TOO_LONG'));
              else patchTitle = trimmed;
            }
          }

          if ('body' in bodyObj) {
            if (typeof bodyObj['body'] !== 'string') {
              issues.push(createIssue('body', ['body'], 'INVALID_TYPE'));
            } else {
              const trimmed = bodyObj['body'].trim();
              if (trimmed.length < 10) issues.push(createIssue('body', ['body'], 'TOO_SHORT'));
              else if (trimmed.length > 10000) issues.push(createIssue('body', ['body'], 'TOO_LONG'));
              else patchBody = trimmed;
            }
          }

          if ('professionalName' in bodyObj) {
            if (typeof bodyObj['professionalName'] !== 'string') {
              issues.push(createIssue('body', ['professionalName'], 'INVALID_TYPE'));
            } else {
              const trimmed = bodyObj['professionalName'].trim();
              if (trimmed.length < 3) issues.push(createIssue('body', ['professionalName'], 'TOO_SHORT'));
              else if (trimmed.length > 120) issues.push(createIssue('body', ['professionalName'], 'TOO_LONG'));
              else patchProf = trimmed;
            }
          }
        }
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const report = db.reports.find((r) => r.id === idParsed.data);
      if (!report) return errorResponse('NOT_FOUND', 404);

      const appointment = db.appointments.find((a) => a.id === report.appointmentId);
      if (appointment && appointment.status === 'CANCELED') {
        return errorResponse('APPOINTMENT_CANCELED', 409);
      }

      if (report.status === 'PUBLISHED') return errorResponse('REPORT_LOCKED', 409);

      const now = clock.now().toISOString();
      if (patchTitle !== undefined) report.title = patchTitle;
      if (patchBody !== undefined) report.body = patchBody;
      if (patchProf !== undefined) report.professionalName = patchProf;
      report.updatedAt = now;

      const validated = StaffReportSchema.safeParse(toStaffReportDto(report));
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);

      db.persist();
      return jsonResponse(validated.data);
    }),

    // 14. POST /api/reports/:id/publish
    http.post('*/api/reports/:id/publish', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'STAFF') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const report = db.reports.find((r) => r.id === idParsed.data);
      if (!report) return errorResponse('NOT_FOUND', 404);

      const appointment = db.appointments.find((a) => a.id === report.appointmentId);
      if (appointment && appointment.status === 'CANCELED') {
        return errorResponse('APPOINTMENT_CANCELED', 409);
      }

      if (report.status === 'PUBLISHED') return errorResponse('REPORT_LOCKED', 409);

      const now = clock.now().toISOString();
      const publishedReport: MockReport = {
        ...report,
        status: 'PUBLISHED',
        publishedAt: now,
        updatedAt: now,
      };
      db.reports = db.reports.map((r) => (r.id === report.id ? publishedReport : r));

      const validated = StaffReportSchema.safeParse(toStaffReportDto(publishedReport));

      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);

      db.persist();
      return jsonResponse(validated.data);
    }),

    // 15. GET /api/me/appointments
    http.get('*/api/me/appointments', async ({ request }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'PATIENT') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];
      if (issues.length > 0) return validationErrorResponse(issues);

      const ownAppointments = db.appointments
        .filter((a) => a.patientId === auth.user.id)
        .sort((a, b) => {
          const cmp = compareStringsByCodePoint(a.startsAt, b.startsAt);
          return cmp !== 0 ? cmp : compareStringsByCodePoint(a.id, b.id);
        });

      const dtoList = ownAppointments.map((a) => {
        const examType = db.examTypes.find((e) => e.id === a.examTypeId)!;
        const report = db.reports.find((r) => r.appointmentId === a.id);
        const hasPublished = a.status === 'CANCELED' ? false : Boolean(report && report.status === 'PUBLISHED');
        return {
          id: a.id,
          startsAt: a.startsAt,
          status: a.status,
          examType: { id: examType.id, name: examType.name },
          hasPublishedReport: hasPublished,
        };
      });

      const validated = MyAppointmentListResponseSchema.safeParse(dtoList);
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(validated.data);
    }),

    // 16. GET /api/me/appointments/:id/report
    http.get('*/api/me/appointments/:id/report', async ({ request, params }) => {
      await applyLatency();
      const fault = checkRuntimeFaults();
      if (fault) return fault;

      const auth = authenticateRequest(request, db, clock);
      if (!auth.ok) return auth.response;
      if (auth.user.role !== 'PATIENT') return errorResponse('FORBIDDEN', 403);

      const qResult = parseAndValidateQuery(request.url, { allowed: [] });
      const bIssues = await validateNoBody(request);
      const issues = [...(qResult.ok ? [] : qResult.issues), ...bIssues];

      const rawId = typeof params.id === 'string' ? params.id : '';
      const idParsed = UUIDSchema.safeParse(rawId);
      if (!idParsed.success) {
        issues.push(createIssue('params', ['id'], 'INVALID_FORMAT'));
      }

      if (issues.length > 0) return validationErrorResponse(issues);

      const appointment = db.appointments.find((a) => a.id === idParsed.data);
      const report = appointment ? db.reports.find((r) => r.appointmentId === appointment.id) : null;

      if (!appointment || appointment.patientId !== auth.user.id || !report || report.status !== 'PUBLISHED') {
        return notFoundResponse();
      }

      const examType = db.examTypes.find((e) => e.id === appointment.examTypeId)!;
      const dto = {
        title: report.title,
        body: report.body,
        professionalName: report.professionalName,
        publishedAt: report.publishedAt!,
        examType: { name: examType.name },
        startsAt: appointment.startsAt,
      };

      const validated = PublishedPatientReportSchema.safeParse(dto);
      if (!validated.success) return errorResponse('INTERNAL_ERROR', 500);
      return jsonResponse(validated.data);
    }),

    // Catch-all for unknown /api/* routes
    http.all('*/api/*', async () => {
      await applyLatency();
      return notFoundResponse();
    }),
  ];
}
