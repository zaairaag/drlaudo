import {
  ErrorResponseSchema,
  LoginResponseSchema,
  MyAppointmentListResponseSchema,
  PublishedPatientReportSchema,
  SlotsResponseSchema,
  StaffAppointmentListResponseSchema,
  StaffAppointmentSchema,
  StaffReportSchema,
  type ErrorCode,
  type ValidationIssue,
  type ValidationLocation,
  type ValidationRule,
} from '@drlaudo/contract';
import { describe, expect, it, vi } from 'vitest';
import { createMockDb, MOCK_SNAPSHOT_KEY } from './db';
import { createMemoryStorage, createTestClock, TEST_IDS as ids } from './fixtures';
import { createHandlers } from './handlers';
import { mockClock, mockDb, server } from './node';
import { mockRuntime } from './runtime';

const NOW = '2026-11-10T12:00:00.000Z';
const ORIGIN = 'http://localhost';
const NOT_FOUND = '{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}';
const messages: Record<Exclude<ErrorCode, 'VALIDATION_ERROR'>, string> = {
  UNAUTHORIZED: 'Autenticação necessária ou credenciais inválidas.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos este registro',
  SLOT_TAKEN: 'Este horário acabou de ser ocupado.',
  EMAIL_TAKEN: 'Este e-mail já está cadastrado.',
  REPORT_EXISTS: 'Este agendamento já possui um laudo.',
  REPORT_LOCKED: 'Este laudo foi publicado e não pode ser alterado.',
  CANNOT_CANCEL: 'Este agendamento não pode ser cancelado.',
  APPOINTMENT_CANCELED: 'Não é possível criar, editar ou publicar laudo de um agendamento cancelado.',
  PAST_DATE: 'Escolha um horário que ainda não começou.',
  INVALID_SLOT: 'Escolha um horário da grade, entre 07:00 e 18:30.',
  RATE_LIMITED: 'Muitas tentativas de login. Tente novamente em instantes.',
  INTERNAL_ERROR: 'Não foi possível concluir a solicitação.',
};
const ruleMessages = {
  REQUIRED: 'Campo obrigatório.', INVALID_TYPE: 'Tipo de valor inválido.',
  INVALID_FORMAT: 'Formato de valor inválido.', TOO_SHORT: 'Valor menor que o limite permitido.',
  TOO_LONG: 'Valor maior que o limite permitido.', UNKNOWN_FIELD: 'Campo não permitido.',
  EMPTY_PATCH: 'Informe ao menos um campo.', UNEXPECTED_BODY: 'Não envie corpo nesta requisição.',
  INVALID_JSON: 'Envie JSON válido.', DUPLICATE_QUERY: 'Informe este parâmetro uma única vez.',
};
function issue<Rule extends ValidationRule>(location: ValidationLocation, path: string[], rule: Rule): ValidationIssue {
  return { location, path, rule, message: ruleMessages[rule] } as ValidationIssue;
}
interface CallOptions { token?: string; json?: unknown; raw?: string; headers?: Record<string, string> }
function call(method: string, path: string, options: CallOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body: string | undefined = options.raw;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return fetch(`${ORIGIN}/api${path}`, { method, headers, ...(body === undefined ? {} : { body }) });
}
async function json(response: Response): Promise<unknown> {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toMatch(/^application\/json(?:;\s*charset=utf-8)?$/i);
  return response.json();
}
async function expectError(response: Response, status: number, code: Exclude<ErrorCode, 'VALIDATION_ERROR'>) {
  expect(response.status).toBe(status);
  expect(await json(response)).toEqual({ error: { code, message: messages[code] } });
}
async function expectValidation(response: Response, details: ValidationIssue[]) {
  expect(response.status).toBe(400);
  expect(await json(response)).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details } });
}
async function login(email = 'staff@fixture.test', password = 'Demo@1234') {
  const response = await call('POST', '/auth/login', { json: { email, password } });
  expect(response.status).toBe(200);
  return LoginResponseSchema.parse(await json(response));
}
async function staff() { return (await login()).token; }
async function ana() { return (await login('ana@fixture.test')).token; }
async function bruno() { return (await login('bruno@fixture.test')).token; }
const reportInput = { title: 'Resultado fictício', body: 'Texto fictício de demonstração.', professionalName: 'Dra. Equipe Fictícia' };
function appointmentInput(startsAt = '2026-11-11T16:00:00.000Z') {
  return { patientId: ids.ana, examTypeId: ids.xray, startsAt };
}
const staffRoutes = [
  ['GET', '/patients'], ['POST', '/patients'], ['PATCH', '/patients/bad'], ['GET', '/exam-types'], ['GET', '/slots?date=bad'],
  ['POST', '/appointments'], ['GET', '/appointments'], ['GET', '/appointments/bad'],
  ['POST', '/appointments/bad/cancel'], ['POST', '/appointments/bad/report'],
  ['GET', '/appointments/bad/report'], ['PATCH', '/reports/bad'], ['POST', '/reports/bad/publish'],
] as const;
const patientRoutes = [['GET', '/me/appointments'], ['GET', '/me/appointments/bad/report']] as const;

// These are HTTP simulations, not evidence of JWT signatures or PostgreSQL locks.
describe('T8 — identidade e fronteira HTTP simuladas', () => {
  it('returns the exact public health DTO regardless of an invalid supplied token', async () => {
    const response = await call('GET', '/health', { token: 'invalid' });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: 'ok', db: 'ok' });
  });
  it('normalizes email, leaves password literal, and returns only the authenticated identity', async () => {
    const session = await login('  STAFF@FIXTURE.TEST  ');
    expect(Object.keys(session).sort()).toEqual(['token', 'user']);
    expect(session.user).toEqual({ id: ids.staff, name: 'Equipe QA', email: 'staff@fixture.test', role: 'STAFF' });
    const claims: unknown = JSON.parse(atob(session.token.split('.')[1] ?? ''));
    expect(claims).toEqual({ sub: ids.staff, role: 'STAFF', name: 'Equipe QA', iss: 'drlaudo-api', iat: 1794312000, exp: 1794340800 });
    const me = await call('GET', '/auth/me', { token: session.token });
    expect(me.status).toBe(200);
    expect(await json(me)).toEqual(session.user);
  });
  it.each([
    ['missing@fixture.test', 'Demo@1234'], ['staff@fixture.test', 'wrong'],
    ['staff@fixture.test', ' Demo@1234'], ['staff@fixture.test', 'Demo@1234 '],
  ])('uses one credential error for %s with a literal password', async (email, password) => {
    await expectError(await call('POST', '/auth/login', { json: { email, password } }), 401, 'UNAUTHORIZED');
  });
  it.each(['', 'Bearer', 'Basic abc', 'Bearer a.b.c', 'Bearer a.b.c, Bearer a.b.c', 'Bearer a.b.c extra'])('rejects malformed authorization %s', async (authorization) => {
    await expectError(await call('GET', '/auth/me', { headers: { Authorization: authorization } }), 401, 'UNAUTHORIZED');
  });
  it('rejects a changed token payload rather than trusting decoded claims', async () => {
    const token = await staff();
    const parts = token.split('.');
    const forged = `${parts[0]}.${btoa(JSON.stringify({ sub: ids.ana, role: 'STAFF', name: 'Equipe QA', iss: 'drlaudo-api', iat: 1794312000, exp: 1794340800 }))}.${parts[2]}`;
    await expectError(await call('GET', '/auth/me', { token: forged }), 401, 'UNAUTHORIZED');
  });
  it('accepts the last millisecond before expiry and rejects the exact eight-hour boundary', async () => {
    const token = await staff();
    mockClock.set('2026-11-10T19:59:59.999Z');
    expect((await call('GET', '/auth/me', { token })).status).toBe(200);
    mockClock.set('2026-11-10T20:00:00.000Z');
    await expectError(await call('GET', '/auth/me', { token }), 401, 'UNAUTHORIZED');
  });
  it('rejects a removed user and changed role/name in a still structurally valid token', async () => {
    const token = await staff();
    const user = mockDb.users.find((entry) => entry.id === ids.staff);
    if (!user) throw new Error('Missing arranged staff');
    user.name = 'Outra identidade';
    await expectError(await call('GET', '/auth/me', { token }), 401, 'UNAUTHORIZED');
    mockDb.users.splice(mockDb.users.indexOf(user), 1);
    await expectError(await call('GET', '/auth/me', { token }), 401, 'UNAUTHORIZED');
  });
  it.each([...staffRoutes, ...patientRoutes, ['GET', '/auth/me']] as const)('authenticates before validation on %s %s', async (method, path) => {
    await expectError(await call(method, path, method === 'GET' ? {} : { raw: '{', headers: { 'Content-Type': 'application/json' } }), 401, 'UNAUTHORIZED');
  });
  it.each(staffRoutes)('denies PATIENT before validating STAFF %s %s', async (method, path) => {
    await expectError(await call(method, path, { token: await ana(), ...(method === 'GET' ? {} : { raw: '{', headers: { 'Content-Type': 'application/json' } }) }), 403, 'FORBIDDEN');
  });
  it.each(patientRoutes)('denies STAFF before validating PATIENT %s %s', async (method, path) => {
    await expectError(await call(method, path, { token: await staff() }), 403, 'FORBIDDEN');
  });
  it('counts successful, invalid-input and invalid-credential logins, then limits before parsing', async () => {
    await login();
    for (let index = 0; index < 9; index += 1) {
      const response = await call('POST', '/auth/login', index % 2 === 0 ? { json: {} } : { json: { email: 'no@fixture.test', password: 'wrong' } });
      expect(response.status).toBe(index % 2 === 0 ? 400 : 401);
    }
    mockClock.set('2026-11-10T12:00:00.001Z');
    const response = await call('POST', '/auth/login', { raw: '{', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.55' } });
    await expectError(response, 429, 'RATE_LIMITED');
    expect(response.headers.get('retry-after')).toBe('60');
    mockClock.set('2026-11-10T12:00:59.001Z');
    const remaining = await call('POST', '/auth/login', { json: {} });
    expect(remaining.status).toBe(429);
    expect(remaining.headers.get('retry-after')).toBe('1');
    mockClock.set('2026-11-10T12:01:00.000Z');
    expect((await call('POST', '/auth/login', { json: {} })).status).toBe(400);
  });
  it.each([
    [undefined, [issue('body', [], 'REQUIRED')]],
    [null, [issue('body', [], 'INVALID_TYPE')]],
    [[], [issue('body', [], 'INVALID_TYPE')]],
    [{}, [issue('body', ['email'], 'REQUIRED'), issue('body', ['password'], 'REQUIRED')]],
    [{ email: 123, password: false }, [issue('body', ['email'], 'INVALID_TYPE'), issue('body', ['password'], 'INVALID_TYPE')]],
    [{ email: ' ', password: '' }, [issue('body', ['email'], 'TOO_SHORT'), issue('body', ['password'], 'TOO_SHORT')]],
    [{ email: 'invalid', password: 'x', extra: true }, [issue('body', ['email'], 'INVALID_FORMAT'), issue('body', ['extra'], 'UNKNOWN_FIELD')]],
    [{ email: `${'x'.repeat(250)}@a.test`, password: 'x' }, [issue('body', ['email'], 'TOO_LONG')]],
  ])('normalizes login validation details without raw framework errors (%j)', async (body, expected) => {
    await expectValidation(await call('POST', '/auth/login', body === undefined ? {} : { json: body }), expected);
  });
  it('rejects non-JSON Content-Type before JSON and aggregates independent query failures', async () => {
    await expectValidation(await call('POST', '/auth/login?x=1', { raw: '{', headers: { 'Content-Type': 'text/plain' } }), [issue('query', ['x'], 'UNKNOWN_FIELD'), issue('body', [], 'INVALID_FORMAT')]);
    await expectValidation(await call('POST', '/auth/login?x=1', { raw: '{', headers: { 'Content-Type': 'application/json' } }), [issue('query', ['x'], 'UNKNOWN_FIELD'), issue('body', [], 'INVALID_JSON')]);
  });
  it.each([['PUT', '/appointments'], ['DELETE', `/reports/${ids.draftReport}`], ['POST', '/auth/logout'], ['GET', '/unknown']])('returns the canonical 404 for undefined %s %s', async (method, path) => {
    const response = await call(method, path);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(NOT_FOUND);
  });
  it('fails safely for an invalid saved snapshot until the explicit reset', async () => {
    const storage = createMemoryStorage();
    storage.setItem(MOCK_SNAPSHOT_KEY, 'corrupt');
    const clock = createTestClock(NOW);
    const db = createMockDb({ clock, storage });
    server.resetHandlers(...createHandlers({ db, clock, latency: 0 }));
    await expectError(await call('GET', '/health'), 500, 'INTERNAL_ERROR');
    db.reset();
    expect((await call('GET', '/health')).status).toBe(200);
  });
  it('forces only canonical 500 errors without mutating business state', async () => {
    const token = await staff();
    const before = structuredClone(mockDb.appointments);
    mockRuntime.set({ error500: true });
    await expectError(await call('POST', '/appointments', { token, json: appointmentInput() }), 500, 'INTERNAL_ERROR');
    expect(mockDb.appointments).toEqual(before);
    mockRuntime.reset();
    expect((await call('GET', '/health')).status).toBe(200);
  });
});

describe('administração de pacientes simulada pelo contrato HTTP', () => {
  const input = { name: '  Carla Lima  ', email: ' CARLA@FIXTURE.TEST ', password: ' Literal@123 ' };
  it('cadastro Unicode mantém a identidade no token simulado e em auth/me', async () => {
    const token = await staff();
    const response = await call('POST', '/patients', { token, json: { name: 'Paciente 漢字 🩺', email: 'unicode@fixture.test', password: 'Senha@123' } });
    expect(response.status).toBe(201);
    const session = await login('unicode@fixture.test', 'Senha@123');
    expect(session.user.name).toBe('Paciente 漢字 🩺');
    expect(await json(await call('GET', '/auth/me', { token: session.token }))).toEqual(session.user);
  });
  it('cria somente PATIENT, normaliza cadastro, permite login e não expõe senha', async () => {
    const token = await staff();
    const response = await call('POST', '/patients', { token, json: input });
    expect(response.status).toBe(201);
    const created: unknown = await json(response);
    expect(created).toEqual({ id: expect.any(String), name: 'Carla Lima', email: 'carla@fixture.test' });
    const session = await login('carla@fixture.test', input.password);
    expect(session.user).toMatchObject({ name: 'Carla Lima', email: 'carla@fixture.test', role: 'PATIENT' });
    const list = await call('GET', '/patients', { token });
    expect(await json(list)).toEqual([
      { id: ids.ana, name: 'Ana QA', email: 'ana@fixture.test' },
      { id: ids.bruno, name: 'Bruno QA', email: 'bruno@fixture.test' },
      created,
    ]);
    expect(await json(await call('GET', '/me/appointments', { token: session.token }))).toEqual([]);
  });
  it('edita somente nome/email e atualiza o nome em agendamento sem mudar credenciais ou ownership', async () => {
    const token = await staff();
    const response = await call('PATCH', `/patients/${ids.ana}`, { token, json: { name: 'Ana Revisada', email: ' NOVA@FIXTURE.TEST ' } });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ id: ids.ana, name: 'Ana Revisada', email: 'nova@fixture.test' });
    const session = await login('nova@fixture.test');
    expect(session.user).toMatchObject({ id: ids.ana, role: 'PATIENT' });
    expect(await json(await call('GET', `/appointments/${ids.draftAppointment}`, { token }))).toMatchObject({ patient: { id: ids.ana, name: 'Ana Revisada' } });
  });
  it('conflito de email em criação/edição retorna 409 sem mutar usuários', async () => {
    const token = await staff();
    const before = structuredClone(mockDb.users);
    for (const [method, path, body] of [
      ['POST', '/patients', { ...input, email: ' ANA@FIXTURE.TEST ' }],
      ['PATCH', `/patients/${ids.ana}`, { email: ' STAFF@FIXTURE.TEST ' }],
    ] as const) {
      const response = await call(method, path, { token, json: body });
      expect(response.status).toBe(409);
      expect(await json(response)).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'Este e-mail já está cadastrado.' } });
    }
    expect(mockDb.users).toEqual(before);
  });
  it.each([ids.staff, '10000000-0000-4000-8000-000000000099'])('edição de alvo %s retorna o mesmo 404', async (id) => {
    const response = await call('PATCH', `/patients/${id}`, { token: await staff(), json: { name: 'Outro Nome' } });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_FOUND);
  });
  it.each([
    [{ ...input, name: ' a ' }, [issue('body', ['name'], 'TOO_SHORT')]],
    [{ ...input, name: 'x'.repeat(121) }, [issue('body', ['name'], 'TOO_LONG')]],
    [{ ...input, password: '1234567' }, [issue('body', ['password'], 'TOO_SHORT')]],
    [{ ...input, password: 'é'.repeat(37) }, [issue('body', ['password'], 'TOO_LONG')]],
    [{ ...input, role: 'STAFF' }, [issue('body', ['role'], 'UNKNOWN_FIELD')]],
  ])('rejeita cadastro inválido sem gravar: %j', async (body, expected) => {
    const token = await staff();
    const before = structuredClone(mockDb.users);
    await expectValidation(await call('POST', '/patients', { token, json: body }), expected);
    expect(mockDb.users).toEqual(before);
  });
  it('aplica parser HTTP estrito e agrega query/body antes de procurar alvo', async () => {
    const token = await staff();
    await expectValidation(await call('POST', '/patients?x=1', { token, raw: '{', headers: { 'Content-Type': 'application/json' } }), [issue('query', ['x'], 'UNKNOWN_FIELD'), issue('body', [], 'INVALID_JSON')]);
    await expectValidation(await call('PATCH', `/patients/${ids.ana}`, { token, json: {} }), [issue('body', [], 'EMPTY_PATCH')]);
    await expectValidation(await call('PATCH', `/patients/${ids.ana}`, { token, json: { password: 'Senha@123' } }), [issue('body', [], 'EMPTY_PATCH'), issue('body', ['password'], 'UNKNOWN_FIELD')]);
  });
});

describe('T9 — catálogos e fotografia da grade', () => {
  it('selects only patients and exact public fields, sorted by name then id', async () => {
    const response = await call('GET', '/patients', { token: await staff() });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual([
      { id: ids.ana, name: 'Ana QA', email: 'ana@fixture.test' },
      { id: ids.bruno, name: 'Bruno QA', email: 'bruno@fixture.test' },
    ]);
  });
  it('sorts Unicode by code points, not UTF-16 or the process locale', async () => {
    const anaUser = mockDb.users.find((entry) => entry.id === ids.ana);
    const brunoUser = mockDb.users.find((entry) => entry.id === ids.bruno);
    if (!anaUser || !brunoUser) throw new Error('Missing arranged patients');
    anaUser.name = '\u{10000}';
    brunoUser.name = '\uE000';
    const response = await call('GET', '/patients', { token: await staff() });
    expect(await json(response)).toEqual([
      { id: ids.bruno, name: '\uE000', email: 'bruno@fixture.test' },
      { id: ids.ana, name: '\u{10000}', email: 'ana@fixture.test' },
    ]);
  });
  it('returns exactly the three exam DTOs in binary name order', async () => {
    const response = await call('GET', '/exam-types', { token: await staff() });
    expect(await json(response)).toEqual([
      { id: ids.xray, code: 'XRAY', name: 'Raio-X de tórax' },
      { id: ids.mri, code: 'MRI', name: 'Ressonância de crânio' },
      { id: ids.ultrasound, code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
    ]);
  });
  it.each(['/patients', '/exam-types'])('allows an empty catalog on %s', async (path) => {
    const token = await staff();
    if (path === '/patients') mockDb.users = mockDb.users.filter((user) => user.role === 'STAFF');
    else mockDb.examTypes = [];
    const response = await call('GET', path, { token });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual([]);
  });
  it.each(['/patients', '/exam-types', '/health', '/auth/me'])('rejects an unknown query on %s', async (path) => {
    await expectValidation(await call('GET', `${path}?unexpected=1`, { token: await staff() }), [issue('query', ['unexpected'], 'UNKNOWN_FIELD')]);
  });
  it.each([
    ['', [issue('query', ['date'], 'REQUIRED')]],
    ['?date=2026-02-30', [issue('query', ['date'], 'INVALID_FORMAT')]],
    ['?date=2026-11-11&date=2026-11-11', [issue('query', ['date'], 'DUPLICATE_QUERY')]],
    ['?date=2026-11-11&date%5B%5D=x', [issue('query', ['date[]'], 'UNKNOWN_FIELD')]],
    ['?date=2026-11-11&x=1&x=1', [issue('query', ['x'], 'DUPLICATE_QUERY')]],
  ])('validates slot query strictly: %s', async (query, details) => {
    await expectValidation(await call('GET', `/slots${query}`, { token: await staff() }), details);
  });
  it('returns all normal-day slots, omits reason on free ones, and ignores canceled occupancy', async () => {
    const response = await call('GET', '/slots?date=2026-11-11', { token: await staff() });
    const result = SlotsResponseSchema.parse(await json(response));
    expect(result.date).toBe('2026-11-11');
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.slots).toHaveLength(24);
    expect(result.slots[0]).toEqual({ startsAt: '2026-11-11T10:00:00.000Z', available: true });
    expect(result.slots[2]).toEqual({ startsAt: '2026-11-11T11:00:00.000Z', available: false, reason: 'TAKEN' });
    expect(result.slots[10]).toEqual({ startsAt: '2026-11-11T15:00:00.000Z', available: true });
    expect(result.slots[23]).toEqual({ startsAt: '2026-11-11T21:30:00.000Z', available: true });
  });
  it('uses one captured clock for the whole grid, with PAST taking precedence over TAKEN', async () => {
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.plainAppointment);
    if (!appointment) throw new Error('Missing arranged appointment');
    appointment.startsAt = NOW;
    const token = await staff();
    const now = vi.spyOn(mockClock, 'now');
    const response = await call('GET', '/slots?date=2026-11-10', { token });
    const result = SlotsResponseSchema.parse(await json(response));
    expect(now).toHaveBeenCalledTimes(1);
    expect(result.slots[4]).toEqual({ startsAt: NOW, available: false, reason: 'PAST' });
    expect(result.slots[5]).toEqual({ startsAt: '2026-11-10T12:30:00.000Z', available: true });
  });
  it('returns an entirely unavailable grid for a past day', async () => {
    const response = await call('GET', '/slots?date=2026-11-09', { token: await staff() });
    const result = SlotsResponseSchema.parse(await json(response));
    expect(result.slots).toHaveLength(24);
    expect(result.slots.every((slot) => !slot.available && slot.reason === 'PAST')).toBe(true);
  });
});

describe('T10 — agendar, consultar e cancelar', () => {
  it('creates a new SCHEDULED appointment with an exact staff DTO and no report', async () => {
    const response = await call('POST', '/appointments', { token: await staff(), json: appointmentInput() });
    expect(response.status).toBe(201);
    const result = StaffAppointmentSchema.parse(await json(response));
    expect(result).toEqual({ id: result.id, startsAt: '2026-11-11T16:00:00.000Z', status: 'SCHEDULED', patient: { id: ids.ana, name: 'Ana QA' }, examType: { id: ids.xray, name: 'Raio-X de tórax' }, report: null });
    expect(mockDb.appointments.find((entry) => entry.id === result.id)).toEqual({ id: result.id, ...appointmentInput(), status: 'SCHEDULED', createdAt: NOW, canceledAt: null });
  });
  it('normalizes uppercase UUIDs in request fields and params', async () => {
    const token = await staff();
    const response = await call('POST', '/appointments', { token, json: { ...appointmentInput(), examTypeId: ids.xray.toUpperCase() } });
    expect(response.status).toBe(201);
    const appointment = StaffAppointmentSchema.parse(await json(response));
    const detail = await call('GET', `/appointments/${appointment.id.toUpperCase()}`, { token });
    expect(await json(detail)).toEqual(appointment);
  });
  it.each([
    [{ patientId: ids.missing, startsAt: '2026-11-09T09:15:00.000Z' }, 404, 'NOT_FOUND'],
    [{ patientId: ids.staff }, 404, 'NOT_FOUND'],
    [{ examTypeId: ids.missing }, 404, 'NOT_FOUND'],
    [{ startsAt: '2026-11-09T09:15:00.000Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-11T09:30:00.000Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-11T13:15:00.000Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-11T22:00:00.000Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-11T13:00:01.000Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-11T13:00:00.001Z' }, 422, 'INVALID_SLOT'],
    [{ startsAt: '2026-11-10T11:30:00.000Z' }, 422, 'PAST_DATE'],
    [{ startsAt: NOW }, 422, 'PAST_DATE'],
    [{ startsAt: '2026-11-11T13:00:00.000Z' }, 409, 'SLOT_TAKEN'],
  ] as const)('enforces existence → grid → past → occupied precedence (%j)', async (overrides, status, code) => {
    const before = structuredClone(mockDb.appointments);
    await expectError(await call('POST', '/appointments', { token: await staff(), json: { ...appointmentInput(), ...overrides } }), status, code);
    expect(mockDb.appointments).toEqual(before);
  });
  it('lets PAST_DATE win over an occupied, otherwise valid slot', async () => {
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.plainAppointment);
    if (!appointment) throw new Error('Missing arranged appointment');
    appointment.startsAt = NOW;
    await expectError(await call('POST', '/appointments', { token: await staff(), json: appointmentInput(NOW) }), 422, 'PAST_DATE');
  });
  it.each(['2026-11-11T10:00:00.000Z', '2026-11-11T21:30:00.000Z', '2026-11-10T12:30:00.000Z'])('accepts the valid future grid boundary %s', async (startsAt) => {
    expect((await call('POST', '/appointments', { token: await staff(), json: appointmentInput(startsAt) })).status).toBe(201);
  });
  it.each([
    [{ patientId: 'no' }, [issue('body', ['patientId'], 'INVALID_FORMAT')]],
    [{ startsAt: '2026-11-11T13:00:00Z' }, [issue('body', ['startsAt'], 'INVALID_FORMAT')]],
    [{ startsAt: '2026-11-11T10:00:00.000-03:00' }, [issue('body', ['startsAt'], 'INVALID_FORMAT')]],
    [{ startsAt: '2026-02-30T13:00:00.000Z' }, [issue('body', ['startsAt'], 'INVALID_FORMAT')]],
    [{ patientId: null }, [issue('body', ['patientId'], 'INVALID_TYPE')]],
    [{ status: 'CANCELED' }, [issue('body', ['status'], 'UNKNOWN_FIELD')]],
  ])('rejects bad creation fields without writing (%j)', async (overrides, details) => {
    const before = structuredClone(mockDb.appointments);
    await expectValidation(await call('POST', '/appointments', { token: await staff(), json: { ...appointmentInput(), ...overrides } }), details);
    expect(mockDb.appointments).toEqual(before);
  });
  it('atomically arbitrates two simulated overlapping creates without promising a database lock', async () => {
    const token = await staff();
    const responses = await Promise.all([call('POST', '/appointments', { token, json: appointmentInput() }), call('POST', '/appointments', { token, json: appointmentInput() })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(mockDb.appointments.filter((entry) => entry.startsAt === '2026-11-11T16:00:00.000Z' && entry.status === 'SCHEDULED')).toHaveLength(1);
    const loser = responses.find((response) => response.status === 409);
    if (!loser) throw new Error('Missing losing request');
    await expectError(loser, 409, 'SLOT_TAKEN');
  });
  it('returns an ordered full staff list with explicit report summaries', async () => {
    mockDb.appointments.reverse();
    const response = await call('GET', '/appointments?date=2026-11-11', { token: await staff() });
    const result = StaffAppointmentListResponseSchema.parse(await json(response));
    expect(result.map((entry) => entry.id)).toEqual([ids.publishedAppointment, ids.draftAppointment, ids.plainAppointment, ids.brunoAppointment, ids.canceledAppointment]);
    expect(result[0]?.report).toEqual({ id: ids.publishedReport, status: 'PUBLISHED' });
    expect(result[1]?.report).toEqual({ id: ids.draftReport, status: 'DRAFT' });
    expect(result[4]?.status).toBe('CANCELED');
  });
  it('combines date and patient with AND and returns [] for absent or STAFF patient ids', async () => {
    const token = await staff();
    const response = await call('GET', `/appointments?date=2026-11-11&patientId=${ids.ana}`, { token });
    const result = StaffAppointmentListResponseSchema.parse(await json(response));
    expect(result.map((entry) => entry.id)).toEqual([ids.publishedAppointment, ids.draftAppointment, ids.plainAppointment]);
    for (const patientId of [ids.missing, ids.staff]) {
      expect(await json(await call('GET', `/appointments?patientId=${patientId}`, { token }))).toEqual([]);
    }
    expect(await json(await call('GET', `/appointments?date=2026-11-12&patientId=${ids.ana}`, { token }))).toEqual([]);
  });
  it('uses a civil 30-day default interval including earlier today and excluding the exact end', async () => {
    const [first, second, third, fourth, fifth] = mockDb.appointments;
    if (!first || !second || !third || !fourth || !fifth) throw new Error('Missing arranged boundary appointments');
    first.startsAt = '2026-11-10T02:59:59.999Z';
    second.startsAt = '2026-11-10T03:00:00.000Z';
    third.startsAt = '2026-12-10T02:59:59.999Z';
    fourth.startsAt = '2026-12-10T03:00:00.000Z';
    fifth.startsAt = '2026-11-10T10:00:00.000Z';
    const response = await call('GET', '/appointments', { token: await staff() });
    const result = StaffAppointmentListResponseSchema.parse(await json(response));
    expect(result.map((entry) => entry.id)).toEqual([ids.draftAppointment, ids.canceledAppointment, ids.plainAppointment]);
  });
  it('filters an explicit day as [local midnight, next local midnight)', async () => {
    const [first, second, third, fourth] = mockDb.appointments;
    if (!first || !second || !third || !fourth) throw new Error('Missing arranged day boundaries');
    first.startsAt = '2026-11-10T02:59:59.999Z';
    second.startsAt = '2026-11-10T03:00:00.000Z';
    third.startsAt = '2026-11-11T02:59:59.999Z';
    fourth.startsAt = '2026-11-11T03:00:00.000Z';
    const response = await call('GET', `/appointments?date=2026-11-10&patientId=${ids.ana}`, { token: await staff() });
    expect(StaffAppointmentListResponseSchema.parse(await json(response)).map((entry) => entry.id)).toEqual([ids.draftAppointment, ids.plainAppointment]);
  });
  it('loads detail regardless of date window or report absence', async () => {
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.plainAppointment);
    if (!appointment) throw new Error('Missing arranged appointment');
    appointment.startsAt = '2020-01-01T13:00:00.000Z';
    const response = await call('GET', `/appointments/${ids.plainAppointment}`, { token: await staff() });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ id: ids.plainAppointment, startsAt: '2020-01-01T13:00:00.000Z', status: 'SCHEDULED', patient: { id: ids.ana, name: 'Ana QA' }, examType: { id: ids.mri, name: 'Ressonância de crânio' }, report: null });
  });
  it.each([['not-a-uuid', 400], [ids.missing, 404]] as const)('distinguishes invalid and nonexistent detail ids: %s', async (id, status) => {
    const response = await call('GET', `/appointments/${id}`, { token: await staff() });
    if (status === 400) await expectValidation(response, [issue('params', ['id'], 'INVALID_FORMAT')]);
    else await expectError(response, 404, 'NOT_FOUND');
  });
  it('cancels a past appointment once and records only the captured canceledAt', async () => {
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.plainAppointment);
    if (!appointment) throw new Error('Missing arranged appointment');
    appointment.startsAt = '2026-11-09T13:00:00.000Z';
    const token = await staff();
    const response = await call('POST', `/appointments/${ids.plainAppointment}/cancel`, { token });
    expect(response.status).toBe(200);
    expect(StaffAppointmentSchema.parse(await json(response)).status).toBe('CANCELED');
    expect(mockDb.appointments.find((entry) => entry.id === ids.plainAppointment)?.canceledAt).toBe(NOW);
    const before = structuredClone(mockDb.appointments);
    mockClock.set('2026-11-10T12:01:00.000Z');
    await expectError(await call('POST', `/appointments/${ids.plainAppointment}/cancel`, { token }), 409, 'CANNOT_CANCEL');
    expect(mockDb.appointments).toEqual(before);
  });
  it('preserves a draft on cancellation and reuses the future slot only with a new appointment id', async () => {
    const token = await staff();
    const before = structuredClone(mockDb.reports);
    expect((await call('POST', `/appointments/${ids.draftAppointment}/cancel`, { token })).status).toBe(200);
    expect(mockDb.reports).toEqual(before);
    const response = await call('POST', '/appointments', { token, json: appointmentInput('2026-11-11T12:00:00.000Z') });
    expect(response.status).toBe(201);
    const replacement = StaffAppointmentSchema.parse(await json(response));
    expect(replacement.id).not.toBe(ids.draftAppointment);
    expect(replacement.report).toBeNull();
    expect(mockDb.appointments.find((entry) => entry.id === ids.draftAppointment)?.status).toBe('CANCELED');
    expect(mockDb.reports).toEqual(before);
  });
  it.each([ids.publishedAppointment, ids.canceledAppointment])('refuses cancellation without changing any records: %s', async (id) => {
    const before = structuredClone({ appointments: mockDb.appointments, reports: mockDb.reports });
    await expectError(await call('POST', `/appointments/${id}/cancel`, { token: await staff() }), 409, 'CANNOT_CANCEL');
    expect({ appointments: mockDb.appointments, reports: mockDb.reports }).toEqual(before);
  });
  it.each(['{}', 'null', '[1]', 'not-json'])('rejects any nonempty cancel body before content type or parsing: %s', async (raw) => {
    await expectValidation(await call('POST', `/appointments/${ids.plainAppointment}/cancel`, { token: await staff(), raw, headers: { 'Content-Type': 'text/plain' } }), [issue('body', [], 'UNEXPECTED_BODY')]);
  });
});

describe('T11 — rascunhos, PATCH e publicação imutável', () => {
  it('creates a normalized draft on a future appointment, without publishing', async () => {
    const response = await call('POST', `/appointments/${ids.plainAppointment}/report`, { token: await staff(), json: { title: '  Resultado fictício  ', body: '  Texto  com espaços\ne quebras preservadas.  ', professionalName: '  Dra. QA  ' } });
    expect(response.status).toBe(201);
    const result = StaffReportSchema.parse(await json(response));
    expect(result).toEqual({ id: result.id, appointmentId: ids.plainAppointment, title: 'Resultado fictício', body: 'Texto  com espaços\ne quebras preservadas.', professionalName: 'Dra. QA', status: 'DRAFT', publishedAt: null, updatedAt: NOW });
    expect(mockDb.reports.filter((entry) => entry.appointmentId === ids.plainAppointment)).toHaveLength(1);
  });
  it.each([ids.draftAppointment, ids.publishedAppointment])('refuses a second report even if the existing one is published: %s', async (id) => {
    const before = structuredClone(mockDb.reports);
    await expectError(await call('POST', `/appointments/${id}/report`, { token: await staff(), json: reportInput }), 409, 'REPORT_EXISTS');
    expect(mockDb.reports).toEqual(before);
  });
  it.each([ids.missing, ids.plainAppointment])('reads absence as 404 rather than null: %s', async (id) => {
    await expectError(await call('GET', `/appointments/${id}/report`, { token: await staff() }), 404, 'NOT_FOUND');
  });
  it('reads a preserved canceled draft for staff and blocks all three mutations', async () => {
    const token = await staff();
    await call('POST', `/appointments/${ids.draftAppointment}/cancel`, { token });
    const before = structuredClone(mockDb.reports);
    const read = await call('GET', `/appointments/${ids.draftAppointment}/report`, { token });
    expect(read.status).toBe(200);
    expect(StaffReportSchema.parse(await json(read)).status).toBe('DRAFT');
    await expectError(await call('POST', `/appointments/${ids.draftAppointment}/report`, { token, json: reportInput }), 409, 'APPOINTMENT_CANCELED');
    await expectError(await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: 'Outro título' } }), 409, 'APPOINTMENT_CANCELED');
    await expectError(await call('POST', `/reports/${ids.draftReport}/publish`, { token }), 409, 'APPOINTMENT_CANCELED');
    expect(mockDb.reports).toEqual(before);
  });
  it('saves only supplied fields and updates the timestamp even when the supplied value is unchanged', async () => {
    const token = await staff();
    mockClock.set('2026-11-10T12:01:00.123Z');
    const response = await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: '  Título revisado  ' } });
    expect(response.status).toBe(200);
    const result = StaffReportSchema.parse(await json(response));
    expect(result).toEqual({ id: ids.draftReport, appointmentId: ids.draftAppointment, title: 'Título revisado', body: 'SENTINELA-RASCUNHO-ANA-741', professionalName: 'Dra. QA', status: 'DRAFT', publishedAt: null, updatedAt: '2026-11-10T12:01:00.123Z' });
    mockClock.set('2026-11-10T12:02:00.456Z');
    const repeated = await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: 'Título revisado' } });
    expect(StaffReportSchema.parse(await json(repeated))).toEqual({ ...result, updatedAt: '2026-11-10T12:02:00.456Z' });
  });
  it.each([
    [undefined, [issue('body', [], 'REQUIRED')]],
    [null, [issue('body', [], 'INVALID_TYPE')]],
    [[], [issue('body', [], 'INVALID_TYPE')]],
    [{}, [issue('body', [], 'EMPTY_PATCH')]],
    [{ status: 'DRAFT' }, [issue('body', [], 'EMPTY_PATCH'), issue('body', ['status'], 'UNKNOWN_FIELD')]],
    [{ title: null }, [issue('body', ['title'], 'INVALID_TYPE')]],
    [{ title: '  ' }, [issue('body', ['title'], 'TOO_SHORT')]],
    [{ title: 'ab', body: '123456789', professionalName: false }, [issue('body', ['body'], 'TOO_SHORT'), issue('body', ['professionalName'], 'INVALID_TYPE'), issue('body', ['title'], 'TOO_SHORT')]],
  ])('validates partial writes without changing the saved report (%j)', async (body, details) => {
    const before = structuredClone(mockDb.reports);
    await expectValidation(await call('PATCH', `/reports/${ids.draftReport}`, { token: await staff(), ...(body === undefined ? {} : { json: body }) }), details);
    expect(mockDb.reports).toEqual(before);
  });
  it('sorts aggregated validation by location/path/rule and prioritizes duplicate keys even when unknown', async () => {
    await expectValidation(await call('PATCH', '/reports/bad?z=1&z=1&=x&a=1', { token: await staff(), raw: '{', headers: { 'Content-Type': 'application/json' } }), [
      issue('params', ['id'], 'INVALID_FORMAT'), issue('query', [''], 'UNKNOWN_FIELD'), issue('query', ['a'], 'UNKNOWN_FIELD'), issue('query', ['z'], 'DUPLICATE_QUERY'), issue('body', [], 'INVALID_JSON'),
    ]);
  });
  it.each([
    ['title', 2, false], ['title', 3, true], ['title', 120, true], ['title', 121, false],
    ['professionalName', 2, false], ['professionalName', 3, true], ['professionalName', 120, true], ['professionalName', 121, false],
    ['body', 9, false], ['body', 10, true], ['body', 10000, true], ['body', 10001, false],
  ] as const)('applies UTF-16 limits after trim for %s (%d)', async (field, length, accepted) => {
    const token = await staff();
    const value = `  ${'a'.repeat(length)}  `;
    const before = structuredClone(mockDb.reports);
    const response = await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { [field]: value } });
    if (accepted) {
      expect(response.status).toBe(200);
      expect(StaffReportSchema.parse(await json(response))[field]).toBe('a'.repeat(length));
    } else {
      await expectValidation(response, [issue('body', [field], length < 10 ? 'TOO_SHORT' : 'TOO_LONG')]);
      expect(mockDb.reports).toEqual(before);
    }
  });
  it('counts surrogate pairs as two UTF-16 units and preserves literal markup as text', async () => {
    const token = await staff();
    const accepted = await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: '😀a', body: '<b>Texto fictício</b>\nlinha' } });
    expect(accepted.status).toBe(200);
    expect(StaffReportSchema.parse(await json(accepted)).title).toBe('😀a');
    await expectValidation(await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: '😀'.repeat(61) } }), [issue('body', ['title'], 'TOO_LONG')]);
  });
  it('publishes a future exam with equal captured timestamps and refuses all later changes', async () => {
    const token = await staff();
    mockClock.set('2026-11-10T12:01:00.123Z');
    const response = await call('POST', `/reports/${ids.draftReport}/publish`, { token });
    expect(response.status).toBe(200);
    const published = StaffReportSchema.parse(await json(response));
    expect(published).toEqual({ id: ids.draftReport, appointmentId: ids.draftAppointment, title: 'Rascunho Ana', body: 'SENTINELA-RASCUNHO-ANA-741', professionalName: 'Dra. QA', status: 'PUBLISHED', publishedAt: '2026-11-10T12:01:00.123Z', updatedAt: '2026-11-10T12:01:00.123Z' });
    const before = structuredClone({ reports: mockDb.reports, appointments: mockDb.appointments });
    mockClock.set('2026-11-10T12:02:00.000Z');
    await expectError(await call('POST', `/reports/${ids.draftReport}/publish`, { token }), 409, 'REPORT_LOCKED');
    await expectError(await call('PATCH', `/reports/${ids.draftReport}`, { token, json: { title: 'Título novo' } }), 409, 'REPORT_LOCKED');
    await expectError(await call('POST', `/appointments/${ids.draftAppointment}/cancel`, { token }), 409, 'CANNOT_CANCEL');
    expect({ reports: mockDb.reports, appointments: mockDb.appointments }).toEqual(before);
  });
  it('validates an empty PATCH before checking publication state', async () => {
    const token = await staff();
    await expectValidation(await call('PATCH', `/reports/${ids.publishedReport}`, { token, json: {} }), [issue('body', [], 'EMPTY_PATCH')]);
    await expectError(await call('PATCH', `/reports/${ids.publishedReport}`, { token, json: { title: 'Título novo' } }), 409, 'REPORT_LOCKED');
  });
  it.each(['{}', 'null', ' '])('rejects publish bodies without interpreting JSON: %j', async (raw) => {
    await expectValidation(await call('POST', `/reports/${ids.draftReport}/publish`, { token: await staff(), raw }), [issue('body', [], 'UNEXPECTED_BODY')]);
  });
  it('serializes simulated cancel and publish sections without an impossible final aggregate', async () => {
    const token = await staff();
    const responses = await Promise.all([call('POST', `/appointments/${ids.draftAppointment}/cancel`, { token }), call('POST', `/reports/${ids.draftReport}/publish`, { token })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.draftAppointment);
    const report = mockDb.reports.find((entry) => entry.id === ids.draftReport);
    expect([appointment?.status, report?.status]).toEqual(responses[0]?.status === 200 ? ['CANCELED', 'DRAFT'] : ['SCHEDULED', 'PUBLISHED']);
  });
  it('refuses to commit a mutation if its outgoing DTO fails the contract', async () => {
    const patient = mockDb.users.find((entry) => entry.id === ids.ana);
    if (!patient) throw new Error('Missing arranged patient');
    patient.name = '';
    const before = structuredClone(mockDb.appointments);
    await expectError(await call('POST', '/appointments', { token: await staff(), json: appointmentInput() }), 500, 'INTERNAL_ERROR');
    expect(mockDb.appointments).toEqual(before);
  });
});

describe('T12 — portal próprio e ausência opaca', () => {
  it('lists the exact complete Ana history without patient or report metadata', async () => {
    const response = await call('GET', '/me/appointments', { token: await ana() });
    expect(response.status).toBe(200);
    expect(MyAppointmentListResponseSchema.parse(await json(response))).toEqual([
      { id: ids.publishedAppointment, startsAt: '2026-11-11T11:00:00.000Z', status: 'SCHEDULED', examType: { id: ids.xray, name: 'Raio-X de tórax' }, hasPublishedReport: true },
      { id: ids.draftAppointment, startsAt: '2026-11-11T12:00:00.000Z', status: 'SCHEDULED', examType: { id: ids.ultrasound, name: 'Ultrassonografia de abdome' }, hasPublishedReport: false },
      { id: ids.plainAppointment, startsAt: '2026-11-11T13:00:00.000Z', status: 'SCHEDULED', examType: { id: ids.mri, name: 'Ressonância de crânio' }, hasPublishedReport: false },
    ]);
  });
  it('isolates Bruno, preserving canceled entries and excluding every Ana appointment', async () => {
    const response = await call('GET', '/me/appointments', { token: await bruno() });
    expect(await json(response)).toEqual([
      { id: ids.brunoAppointment, startsAt: '2026-11-11T14:00:00.000Z', status: 'SCHEDULED', examType: { id: ids.xray, name: 'Raio-X de tórax' }, hasPublishedReport: false },
      { id: ids.canceledAppointment, startsAt: '2026-11-11T15:00:00.000Z', status: 'CANCELED', examType: { id: ids.ultrasound, name: 'Ultrassonografia de abdome' }, hasPublishedReport: false },
    ]);
  });
  it('does not restrict patient history to the staff thirty-day window', async () => {
    const appointment = mockDb.appointments.find((entry) => entry.id === ids.plainAppointment);
    if (!appointment) throw new Error('Missing arranged appointment');
    appointment.startsAt = '2020-01-01T13:00:00.000Z';
    const response = await call('GET', '/me/appointments', { token: await ana() });
    expect(MyAppointmentListResponseSchema.parse(await json(response)).map((entry) => entry.id)).toEqual([ids.plainAppointment, ids.publishedAppointment, ids.draftAppointment]);
  });
  it('returns [] when the authenticated patient has no appointments', async () => {
    mockDb.appointments = mockDb.appointments.filter((entry) => entry.patientId !== ids.bruno);
    expect(await json(await call('GET', '/me/appointments', { token: await bruno() }))).toEqual([]);
  });
  it('returns only the exact published patient DTO', async () => {
    const response = await call('GET', `/me/appointments/${ids.publishedAppointment}/report`, { token: await ana() });
    expect(response.status).toBe(200);
    expect(PublishedPatientReportSchema.parse(await json(response))).toEqual({ title: 'Publicado Ana', body: 'SENTINELA-PUBLICADO-ANA-852', professionalName: 'Dra. QA', publishedAt: NOW, examType: { name: 'Raio-X de tórax' }, startsAt: '2026-11-11T11:00:00.000Z' });
  });
  it('produces byte-identical absent, foreign, own-empty, and own-draft 404s with identical headers', async () => {
    const token = await ana();
    const responses = await Promise.all([ids.missing, ids.brunoAppointment, ids.plainAppointment, ids.draftAppointment].map((id) => call('GET', `/me/appointments/${id}/report`, { token })));
    const headers = Array.from(responses[0]?.headers.entries() ?? []);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(Array.from(response.headers.entries())).toEqual(headers);
      expect(await response.text()).toBe(NOT_FOUND);
    }
  });
  it.each([['patientId', ids.bruno], ['date', '2026-11-11'], ['status', 'PUBLISHED']])('rejects attempted history selection by %s', async (key, value) => {
    await expectValidation(await call('GET', `/me/appointments?${key}=${value}`, { token: await ana() }), [issue('query', [key], 'UNKNOWN_FIELD')]);
  });
  it.each([ids.publishedAppointment, ids.draftAppointment, ids.missing])('rejects injected patientId even when a report is unavailable: %s', async (id) => {
    await expectValidation(await call('GET', `/me/appointments/${id}/report?patientId=${ids.ana}`, { token: await bruno() }), [issue('query', ['patientId'], 'UNKNOWN_FIELD')]);
  });
  it('keeps missing and draft list entries indistinguishable beyond appointment data', async () => {
    const token = await ana();
    const before = await json(await call('GET', '/me/appointments', { token }));
    mockDb.reports = mockDb.reports.filter((entry) => entry.id !== ids.draftReport);
    expect(await json(await call('GET', '/me/appointments', { token }))).toEqual(before);
  });
  it('reveals a newly published report only on its owner’s subsequent reads', async () => {
    const staffToken = await staff();
    const anaToken = await ana();
    const brunoToken = await bruno();
    await expectError(await call('GET', `/me/appointments/${ids.draftAppointment}/report`, { token: anaToken }), 404, 'NOT_FOUND');
    expect((await call('POST', `/reports/${ids.draftReport}/publish`, { token: staffToken })).status).toBe(200);
    const response = await call('GET', '/me/appointments', { token: anaToken });
    const own = MyAppointmentListResponseSchema.parse(await json(response));
    expect(own.find((entry) => entry.id === ids.draftAppointment)?.hasPublishedReport).toBe(true);
    expect((await call('GET', `/me/appointments/${ids.draftAppointment}/report`, { token: anaToken })).status).toBe(200);
    await expectError(await call('GET', `/me/appointments/${ids.draftAppointment}/report`, { token: brunoToken }), 404, 'NOT_FOUND');
  });
  it('uses output validation rather than leaking an invalid clinical DTO', async () => {
    const report = mockDb.reports.find((entry) => entry.id === ids.publishedReport);
    if (!report) throw new Error('Missing arranged report');
    report.body = 'short';
    const response = await call('GET', `/me/appointments/${ids.publishedAppointment}/report`, { token: await ana() });
    await expectError(response, 500, 'INTERNAL_ERROR');
  });
  it('always emits the canonical error envelope without extra details on business errors', async () => {
    const response = await call('GET', `/me/appointments/${ids.missing}/report`, { token: await ana() });
    expect(ErrorResponseSchema.parse(await json(response))).toEqual({ error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' } });
  });
});
