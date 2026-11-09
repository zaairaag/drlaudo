import { describe, expect, it } from 'vitest';
import {
  EmailSchema, UUIDSchema, TokenSchema, RoleSchema, EmptyObjectSchema,
  NoBodySchema, IdParamsSchema, UserSchema, LoginRequestSchema,
  LoginResponseSchema, JwtClaimsSchema, ErrorResponseSchema, ValidationIssueSchema,
  HealthResponseSchema, PatientSchema, PatientSummarySchema, PatientListResponseSchema,
  ExamTypeSchema, ExamTypeSummarySchema, ExamTypeNameSchema, ExamTypeListResponseSchema,
  ReportSummarySchema, StaffAppointmentSchema, CreateAppointmentRequestSchema,
  AppointmentListQuerySchema, StaffAppointmentListResponseSchema, StaffReportSchema,
  CreateReportRequestSchema, UpdateReportRequestSchema, MyAppointmentSchema,
  MyAppointmentListResponseSchema, PublishedPatientReportSchema,
} from '../src/index.js';

const id = 'abcdef12-3456-4789-abcd-123456789abc';
const user = { id, name: 'Ana Souza', email: 'ana@drlaudo.test', role: 'PATIENT' };
const claims = { sub: id, role: 'PATIENT', name: 'Ana Souza', iss: 'drlaudo-api', iat: 0, exp: 28800 };

describe('E1 E2 RF-01 RF-02: primitivas e identidade', () => {
  it('normaliza UUID maiúsculo sem alterar a identidade', () => {
    expect(UUIDSchema.parse(id.toUpperCase())).toBe(id);
    expect(IdParamsSchema.parse({ id: id.toUpperCase() })).toEqual({ id });
  });
  it.each([
    '', ` ${id}`, `${id} `, 'abcdef12-3456-1789-abcd-123456789abc',
    'abcdef12-3456-4789-7bcd-123456789abc', 'abcdef1234564789abcd123456789abc',
    '00000000-0000-0000-0000-000000000000', 123, null, undefined,
  ])('rejeita UUID fora do contrato: %j', (value) => {
    expect(UUIDSchema.safeParse(value).success).toBe(false);
  });
  it('normaliza e-mail antes de validar', () => {
    expect(EmailSchema.parse('  ANA.SOUZA@DRLAUDO.TEST\n')).toBe('ana.souza@drlaudo.test');
  });
  it.each(['', '  ', 'ana', 'ana@host', 'a b@drlaudo.test', 'ana@@drlaudo.test', null, 123, `${'a'.repeat(245)}@host.test`])('rejeita e-mail inválido: %j', (value) => {
    expect(EmailSchema.safeParse(value).success).toBe(false);
  });
  it('aceita e-mail no limite de 254 unidades', () => {
    const email = `${'a'.repeat(244)}@host.test`;
    expect(EmailSchema.parse(email)).toBe(email);
  });
  it('normaliza espaços externos antes do limite de e-mail', () => {
    const email = `${'a'.repeat(244)}@host.test`;
    expect(EmailSchema.parse(` ${email} `)).toBe(email);
  });
  it('mede o limite de e-mail em UTF-16, inclusive caracteres suplementares', () => {
    const email = `${'😀'.repeat(124)}@x.com`;
    expect(EmailSchema.parse(email)).toBe(email);
    expect(EmailSchema.safeParse(`a${email}`).success).toBe(false);
  });
  it.each(['STAFF', 'PATIENT'])('aceita perfil %s', (role) => {
    expect(RoleSchema.parse(role)).toBe(role);
  });
  it.each(['ADMIN', 'staff', '', 1, null])('rejeita perfil não previsto: %j', (role) => {
    expect(RoleSchema.safeParse(role).success).toBe(false);
  });
  it('valida estrutura compacta sem alegar autenticação do token', () => {
    expect(TokenSchema.parse('abc_DEF.123-abc.fake')).toBe('abc_DEF.123-abc.fake');
  });
  it.each(['a.b', 'a..c', '.b.c', 'a.b.', 'a.b.c.d', 'a.b.c=', ' a.b.c', 'a.b.c\n', null, 123])('rejeita token malformado: %j', (value) => {
    expect(TokenSchema.safeParse(value).success).toBe(false);
  });
  it('distingue ausência de corpo e objeto vazio', () => {
    expect(NoBodySchema.parse(undefined)).toBeUndefined();
    expect(EmptyObjectSchema.parse({})).toEqual({});
  });
  it.each([{}, null, [], '', 'undefined'])('não aceita conteúdo em NoBody: %j', (value) => {
    expect(NoBodySchema.safeParse(value).success).toBe(false);
  });
  it.each([undefined, null, [], '', { patientId: id }])('não aceita objeto vazio indevido: %j', (value) => {
    expect(EmptyObjectSchema.safeParse(value).success).toBe(false);
  });
  it.each([{}, { id: null }, { id, patientId: id }])('params exigem somente id válido: %j', (value) => {
    expect(IdParamsSchema.safeParse(value).success).toBe(false);
  });
  it('normaliza login sem modificar senha', () => {
    expect(LoginRequestSchema.parse({ email: ' ANA@DRLAUDO.TEST ', password: ' Demo@1234 ' }))
      .toEqual({ email: 'ana@drlaudo.test', password: ' Demo@1234 ' });
    expect(LoginRequestSchema.parse({ email: 'ana@drlaudo.test', password: ' ' }).password).toBe(' ');
  });
  it.each([
    { email: user.email }, { email: user.email, password: '' },
    { email: user.email, password: 123 }, { email: user.email, password: null },
    { email: user.email, password: 'x', role: 'STAFF' }, null, [],
  ])('rejeita login incompleto/tipo/elevação de perfil: %j', (value) => {
    expect(LoginRequestSchema.safeParse(value).success).toBe(false);
  });
  it('valida resposta segura e normaliza identidade', () => {
    expect(LoginResponseSchema.parse({ token: 'a.b.c', user: { ...user, id: id.toUpperCase(), email: 'ANA@DRLAUDO.TEST' } }))
      .toEqual({ token: 'a.b.c', user });
  });
  it.each([
    { ...user, passwordHash: 'never-expose' }, { ...user, name: '' },
    { ...user, role: 'ADMIN' }, { id, name: user.name, email: user.email },
  ])('rejeita DTO de usuário inseguro/incompleto: %j', (value) => {
    expect(UserSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { token: 'a.b.c', user, refreshToken: 'x' },
    { token: 'a.b.c', user, expiresIn: 28800 },
    { token: 'a.b.c', user: { ...user, passwordHash: 'secret' } },
    { token: 'invalid', user }, { user },
  ])('rejeita resposta de login ampliada/inválida: %j', (value) => {
    expect(LoginResponseSchema.safeParse(value).success).toBe(false);
  });
  it('aceita claims de oito horas no epoch e no limite seguro', () => {
    expect(JwtClaimsSchema.parse(claims)).toEqual(claims);
    const last = { ...claims, iat: 9007199254712191, exp: 9007199254740991 };
    expect(JwtClaimsSchema.parse(last)).toEqual(last);
  });
  it.each(['sub', 'role', 'name', 'iss', 'iat', 'exp'] as const)(
    'exige o claim obrigatório %s',
    (field) => {
      const incomplete: Record<string, unknown> = { ...claims };
      delete incomplete[field];
      expect(JwtClaimsSchema.safeParse(incomplete).success).toBe(false);
    },
  );
  it.each([
    { ...claims, exp: 28799 }, { ...claims, exp: 28801 },
    { ...claims, iat: -1, exp: 28799 }, { ...claims, iat: 0.5, exp: 28800.5 },
    { ...claims, iat: '0' }, { ...claims, exp: '28800' },
    { ...claims, iat: NaN }, { ...claims, exp: Infinity },
    { ...claims, iat: Number.MAX_SAFE_INTEGER, exp: Number.MAX_SAFE_INTEGER + 28800 },
    { ...claims, iss: 'other-api' }, { ...claims, role: 'ADMIN' },
    { ...claims, name: '' }, { ...claims, aud: 'extra' },
    { ...claims, sub: ` ${id}` },
  ])('rejeita claims inválidos ou expiração diferente de oito horas: %j', (value) => {
    expect(JwtClaimsSchema.safeParse(value).success).toBe(false);
  });
});

const examId = '33333333-3333-4333-8333-333333333333';
const reportId = '44444444-4444-4444-8444-444444444444';
const appointmentId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-11-10T12:00:00.000Z';
const patient = { id, name: 'Ana Souza', email: 'ana@drlaudo.test' };
const patientSummary = { id, name: 'Ana Souza' };
const exam = { id: examId, code: 'XRAY', name: 'Raio-X de tórax' };
const examSummary = { id: examId, name: 'Raio-X de tórax' };
const reportText = { title: 'Exame fictício', body: 'Conteúdo fictício do laudo.', professionalName: 'Dra. Clara' };
const appointment = {
  id: appointmentId, startsAt: timestamp, status: 'SCHEDULED',
  patient: patientSummary, examType: examSummary, report: null,
};
const draft = {
  id: reportId, appointmentId, ...reportText, status: 'DRAFT',
  publishedAt: null, updatedAt: timestamp,
};
const myAppointment = {
  id: appointmentId, startsAt: timestamp, status: 'SCHEDULED',
  examType: examSummary, hasPublishedReport: false,
};
const published = {
  ...reportText, publishedAt: timestamp, examType: { name: 'Raio-X de tórax' }, startsAt: timestamp,
};
const validationIssue = {
  location: 'body', path: ['title'], rule: 'TOO_SHORT', message: 'Valor menor que o limite permitido.',
};
const validationError = {
  error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [validationIssue] },
};

describe('E1 E2 E7: envelopes diagnósticos canônicos e strict', () => {
  it.each([
    ['UNAUTHORIZED', 'Autenticação necessária ou credenciais inválidas.'],
    ['FORBIDDEN', 'Você não tem permissão para esta ação.'],
    ['NOT_FOUND', 'Não encontramos este registro'],
    ['SLOT_TAKEN', 'Este horário acabou de ser ocupado.'],
    ['EMAIL_TAKEN', 'Este e-mail já está cadastrado.'],
    ['REPORT_EXISTS', 'Este agendamento já possui um laudo.'],
    ['REPORT_LOCKED', 'Este laudo foi publicado e não pode ser alterado.'],
    ['CANNOT_CANCEL', 'Este agendamento não pode ser cancelado.'],
    ['APPOINTMENT_CANCELED', 'Não é possível criar, editar ou publicar laudo de um agendamento cancelado.'],
    ['PAST_DATE', 'Escolha um horário que ainda não começou.'],
    ['INVALID_SLOT', 'Escolha um horário da grade, entre 07:00 e 18:30.'],
    ['RATE_LIMITED', 'Muitas tentativas de login. Tente novamente em instantes.'],
    ['INTERNAL_ERROR', 'Não foi possível concluir a solicitação.'],
  ])('aceita somente mensagem correspondente e omite details em %s', (code, message) => {
    const value = { error: { code, message } };
    expect(ErrorResponseSchema.parse(value)).toEqual(value);
    expect(ErrorResponseSchema.safeParse({ error: { code, message: 'Mensagem arbitrária' } }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ error: { code, message, details: [] } }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ error: { code, message, details: [validationIssue] } }).success).toBe(false);
  });
  it('preserva corpo compacto opaco NOT_FOUND byte a byte', () => {
    expect(JSON.stringify(ErrorResponseSchema.parse({
      error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' },
    }))).toBe('{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}');
  });
  it('aceita VALIDATION_ERROR com pelo menos um detalhe canônico', () => {
    expect(ErrorResponseSchema.parse(validationError)).toEqual(validationError);
  });
  it.each([
    { error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.' } },
    { error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [] } },
    { error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: null } },
    { error: { code: 'VALIDATION_ERROR', message: 'Dados incorretos', details: [validationIssue] } },
    { error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [validationIssue], stack: 'private' } },
    { ...validationError, requestId: 'private' },
    { error: { code: 'NOT_FOUND', message: 'Não encontramos este registro', details: null } },
    { error: { code: 'UNKNOWN_ERROR', message: 'Não foi possível concluir a solicitação.' } },
    { error: { code: 404, message: 'Não encontramos este registro' } },
    { error: null }, {}, null, [],
  ])('rejeita envelope sem prova, ampliado ou não canônico: %j', (value) => {
    expect(ErrorResponseSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    ['REQUIRED', 'Campo obrigatório.'],
    ['INVALID_TYPE', 'Tipo de valor inválido.'],
    ['INVALID_FORMAT', 'Formato de valor inválido.'],
    ['TOO_SHORT', 'Valor menor que o limite permitido.'],
    ['TOO_LONG', 'Valor maior que o limite permitido.'],
    ['UNKNOWN_FIELD', 'Campo não permitido.'],
    ['EMPTY_PATCH', 'Informe ao menos um campo.'],
    ['UNEXPECTED_BODY', 'Não envie corpo nesta requisição.'],
    ['INVALID_JSON', 'Envie JSON válido.'],
    ['DUPLICATE_QUERY', 'Informe este parâmetro uma única vez.'],
  ])('vincula mensagem à regra %s sem interpolar valores', (rule, message) => {
    expect(ValidationIssueSchema.parse({ location: 'body', path: [], rule, message }))
      .toEqual({ location: 'body', path: [], rule, message });
    expect(ValidationIssueSchema.safeParse({ location: 'body', path: [], rule, message: 'Mensagem arbitrária' }).success).toBe(false);
  });
  it.each(['params', 'query', 'body'])('aceita location %s e chave vazia literal distinta da raiz', (location) => {
    expect(ValidationIssueSchema.parse({ ...validationIssue, location, path: [''] }).path).toEqual(['']);
    expect(ValidationIssueSchema.parse({ ...validationIssue, location, path: [] }).path).toEqual([]);
  });
  it.each([
    { ...validationIssue, location: 'header' }, { ...validationIssue, path: [0] },
    { ...validationIssue, path: 'body.title' }, { ...validationIssue, rule: 'ZOD_ERROR' },
    { ...validationIssue, message: 'Valor maior que o limite permitido.' },
    { ...validationIssue, value: 'conteúdo privado' }, { ...validationIssue, path: null },
    { location: 'body', rule: 'TOO_SHORT', message: 'Valor menor que o limite permitido.' },
  ])('rejeita detalhe com framework, valor privado ou tipo errado: %j', (value) => {
    expect(ValidationIssueSchema.safeParse(value).success).toBe(false);
  });
  it('admite detalhes na ordem canônica sem duplicações, incluindo pontos de código Unicode', () => {
    const issue = { rule: 'REQUIRED', message: 'Campo obrigatório.' };
    const details = [
      { ...issue, location: 'params', path: [] },
      { ...issue, location: 'params', path: [''] },
      { ...issue, location: 'query', path: [] },
      { ...issue, location: 'query', path: ['a'] },
      { ...issue, location: 'query', path: ['a', 'b'] },
      { ...issue, location: 'query', path: ['\uE000'] },
      { ...issue, location: 'query', path: ['😀'] },
      { ...issue, location: 'body', path: [] },
    ];
    expect(ErrorResponseSchema.parse({ error: { ...validationError.error, details } }).error)
      .toEqual({ ...validationError.error, details });
  });
  it.each([
    [validationIssue, validationIssue],
    [
      { ...validationIssue, location: 'body' },
      { ...validationIssue, location: 'params' },
    ],
    [
      { ...validationIssue, path: ['z'] },
      { ...validationIssue, path: ['a'] },
    ],
    [
      { ...validationIssue, rule: 'TOO_SHORT', message: 'Valor menor que o limite permitido.' },
      { ...validationIssue, rule: 'REQUIRED', message: 'Campo obrigatório.' },
    ],
  ])('rejeita details duplicados ou fora da ordem normativa: %j', (details) => {
    expect(ErrorResponseSchema.safeParse({ error: { ...validationError.error, details } }).success).toBe(false);
  });
  it('health só contém confirmação ok de aplicação e banco', () => {
    expect(HealthResponseSchema.parse({ status: 'ok', db: 'ok' })).toEqual({ status: 'ok', db: 'ok' });
  });
  it.each([{ status: 'ok' }, { status: 'error', db: 'ok' }, { status: 'ok', db: 'down' }, { status: 'ok', db: 'ok', host: 'private' }, null])(
    'rejeita health ampliado, parcial ou indisponível como sucesso: %j', (value) => {
      expect(HealthResponseSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('E1 E2 RF-03 RN-24: catálogos mínimos reutilizáveis', () => {
  it('normaliza identidade e e-mail sem transformar nome', () => {
    expect(PatientSchema.parse({ ...patient, id: id.toUpperCase(), name: ' Ana  Souza ', email: ' ANA@DRLAUDO.TEST ' }))
      .toEqual({ ...patient, name: ' Ana  Souza ' });
    expect(PatientSummarySchema.parse(patientSummary)).toEqual(patientSummary);
  });
  it.each(['XRAY', 'ULTRASOUND', 'MRI'])('aceita código fechado %s no catálogo', (code) => {
    expect(ExamTypeSchema.parse({ ...exam, code })).toEqual({ ...exam, code });
  });
  it('distingue catálogo completo, summary e somente nome', () => {
    expect(ExamTypeSummarySchema.parse(examSummary)).toEqual(examSummary);
    expect(ExamTypeNameSchema.parse({ name: exam.name })).toEqual({ name: 'Raio-X de tórax' });
    expect(ExamTypeSummarySchema.safeParse(exam).success).toBe(false);
    expect(ExamTypeNameSchema.safeParse(examSummary).success).toBe(false);
    expect(PatientSummarySchema.safeParse(patient).success).toBe(false);
  });
  it('aceita arrays vazios e catálogo com cardinalidade diferente do seed', () => {
    expect(PatientListResponseSchema.parse([])).toEqual([]);
    expect(ExamTypeListResponseSchema.parse([])).toEqual([]);
    expect(ExamTypeListResponseSchema.parse([exam])).toEqual([exam]);
    expect(PatientListResponseSchema.parse([patient])).toEqual([patient]);
  });
  it.each([
    { ...patient, role: 'PATIENT' }, { ...patient, passwordHash: 'private' },
    { ...patient, name: '' }, { ...patient, name: 1 }, { ...patient, email: null },
    { id, name: patient.name }, { ...patient, id: 'invalid' }, null, [],
  ])('rejeita DTO paciente incompleto ou com dados não permitidos: %j', (value) => {
    expect(PatientSchema.safeParse(value).success).toBe(false);
  });
  it.each([{ ...exam, code: 'CT' }, { ...exam, name: '' }, { ...exam, name: null }, { ...exam, duration: 30 }, { name: exam.name }])(
    'rejeita exame fora do contrato: %j', (value) => {
      expect(ExamTypeSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each([null, {}, [null], [{ ...patient, passwordHash: 'private' }]])('lista valida todos os pacientes: %j', (value) => {
    expect(PatientListResponseSchema.safeParse(value).success).toBe(false);
  });
  it.each([null, {}, [{ ...exam, code: 'CT' }]])('lista valida todos os exames: %j', (value) => {
    expect(ExamTypeListResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('E1 E2 RF-03 RF-04 RF-05 RN-12: agendamento strict e estados coerentes', () => {
  it.each([
    appointment,
    { ...appointment, report: { id: reportId, status: 'DRAFT' } },
    { ...appointment, report: { id: reportId, status: 'PUBLISHED' } },
    { ...appointment, status: 'CANCELED' },
    { ...appointment, status: 'CANCELED', report: { id: reportId, status: 'DRAFT' } },
  ])('aceita combinações legais do agregado sem conteúdo de laudo: %j', (value) => {
    expect(StaffAppointmentSchema.parse(value)).toEqual(value);
  });
  it.each([
    { ...appointment, status: 'CANCELED', report: { id: reportId, status: 'PUBLISHED' } },
    { ...appointment, status: 'COMPLETED' },
    { ...appointment, report: { id: reportId, status: 'DRAFT', title: 'private' } },
    { ...appointment, patient }, { ...appointment, examType: exam },
    { ...appointment, canceledAt: timestamp }, { ...appointment, report: undefined },
    { ...appointment, startsAt: '2026-11-10T12:00:00Z' },
  ])('rejeita estado impossível, campo extra ou resumo ampliado: %j', (value) => {
    expect(StaffAppointmentSchema.safeParse(value).success).toBe(false);
  });
  it('resumo só admite id e status conhecido', () => {
    expect(ReportSummarySchema.parse({ id: reportId, status: 'DRAFT' })).toEqual({ id: reportId, status: 'DRAFT' });
    expect(ReportSummarySchema.safeParse(draft).success).toBe(false);
    expect(ReportSummarySchema.safeParse({ id: reportId, status: 'ARCHIVED' }).success).toBe(false);
  });
  it('pedido de criação só valida formato; não decide grade ou passado', () => {
    expect(CreateAppointmentRequestSchema.parse({
      patientId: id.toUpperCase(), examTypeId: examId, startsAt: '2000-01-01T00:00:01.001Z',
    })).toEqual({ patientId: id, examTypeId: examId, startsAt: '2000-01-01T00:00:01.001Z' });
  });
  it.each([
    { patientId: id, examTypeId: examId, startsAt: timestamp, status: 'SCHEDULED' },
    { patientId: id, examTypeId: examId, startsAt: timestamp, id: appointmentId },
    { patientId: id, examTypeId: examId, startsAt: timestamp, report: null },
    { patientId: null, examTypeId: examId, startsAt: timestamp },
    { patientId: id, examTypeId: 'invalid', startsAt: timestamp },
    { patientId: id, examTypeId: examId, startsAt: '2026-11-10T12:00:00.000-03:00' },
  ])('rejeita criação ampliada, nula ou malformada: %j', (value) => {
    expect(CreateAppointmentRequestSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    {}, { date: '0001-01-01' }, { patientId: id }, { date: '9999-12-31', patientId: id },
    { scope: 'all' }, { scope: 'all', patientId: id },
  ])(
    'aceita somente filtros opcionais explícitos: %j', (value) => {
      expect(AppointmentListQuerySchema.parse(value)).toEqual(value);
    },
  );
  it.each([
    { date: null }, { date: '' }, { date: '2026-02-30' }, { date: undefined },
    { patientId: null }, { patientId: undefined }, { patientId: [id] },
    { status: 'SCHEDULED' }, { from: '2026-11-10' }, { page: '1' }, { sort: 'startsAt' },
  ])('não aceita null, filtro implícito, vazio ou undefined presente: %j', (value) => {
    expect(AppointmentListQuerySchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { scope: '' }, { scope: 'ALL' }, { scope: 'daily' }, { scope: ' all' }, { scope: 'all ' },
    { scope: null }, { scope: undefined }, { scope: true }, { scope: 1 }, { scope: ['all'] },
    { scope: {} }, { scope: 'all', patientId: null }, { scope: 'all', patientId: undefined },
    { scope: 'all', status: 'SCHEDULED' },
  ])('rejeita scope não literal ou filtros inválidos sem coerção: %j', (value) => {
    expect(AppointmentListQuerySchema.safeParse(value).success).toBe(false);
  });
  it('rejeita date junto com scope=all no caminho date, sem descartar nenhum filtro', () => {
    const result = AppointmentListQuerySchema.safeParse({ scope: 'all', date: '2026-11-10', patientId: id });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('A combinação de modos deve ser inválida');
    expect(result.error.issues).toEqual([
      expect.objectContaining({ path: ['date'], code: 'custom', params: { rule: 'INVALID_FORMAT' } }),
    ]);
  });
  it('listas STAFF aceitam vazio, cancelado e passado sem impor janela ao DTO', () => {
    expect(StaffAppointmentListResponseSchema.parse([])).toEqual([]);
    const value = [{ ...appointment, startsAt: '2000-01-01T00:00:00.000Z', status: 'CANCELED' }];
    expect(StaffAppointmentListResponseSchema.parse(value)).toEqual(value);
    expect(StaffAppointmentListResponseSchema.safeParse([{ ...appointment, patient }]).success).toBe(false);
  });
});

describe('E1 E2 RF-06 RN-16: trim e limites UTF-16 sem perda de texto', () => {
  it('normaliza só extremidades, preservando espaços internos, quebras e texto literal', () => {
    const value = { title: '  Exame  fictício\n', body: '\n  Linha um.\n\nLinha  dois <b>literal</b>.  ', professionalName: '\t Dra.  Clara \u00a0' };
    const expected = { title: 'Exame  fictício', body: 'Linha um.\n\nLinha  dois <b>literal</b>.', professionalName: 'Dra.  Clara' };
    expect(CreateReportRequestSchema.parse(value)).toEqual(expected);
    expect(UpdateReportRequestSchema.parse(value)).toEqual(expected);
  });
  it.each([
    ['title', 'ab', false], ['title', 'abc', true], ['title', 'a'.repeat(120), true], ['title', 'a'.repeat(121), false],
    ['professionalName', 'ab', false], ['professionalName', 'abc', true],
    ['professionalName', 'a'.repeat(120), true], ['professionalName', 'a'.repeat(121), false],
    ['body', 'a'.repeat(9), false], ['body', 'a'.repeat(10), true],
    ['body', 'a'.repeat(10_000), true], ['body', 'a'.repeat(10_001), false],
    ['title', '😀', false], ['title', '😀a', true], ['title', '😀'.repeat(60), true], ['title', `${'😀'.repeat(60)}a`, false],
    ['professionalName', '😀a', true], ['professionalName', '😀'.repeat(60), true], ['professionalName', `${'😀'.repeat(60)}a`, false],
    ['body', '😀'.repeat(4), false], ['body', '😀'.repeat(5), true],
    ['body', '😀'.repeat(5_000), true], ['body', `${'😀'.repeat(5_000)}a`, false],
  ])('aplica limites após trim em %s (%j), válido=%s', (field, text, accepted) => {
    const value = ` \t${text}\n `;
    expect(CreateReportRequestSchema.safeParse({ ...reportText, [field]: value }).success).toBe(accepted);
    expect(UpdateReportRequestSchema.safeParse({ [field]: value }).success).toBe(accepted);
    if (accepted) {
      expect(UpdateReportRequestSchema.parse({ [field]: value })).toEqual({ [field]: text });
    }
  });
  it.each(['title', 'body', 'professionalName'])('não coage ou omite valor inválido presente em %s', (field) => {
    for (const value of ['', ' \t\n\u00a0', null, undefined, 1, false, [], {}]) {
      expect(CreateReportRequestSchema.safeParse({ ...reportText, [field]: value }).success).toBe(false);
      expect(UpdateReportRequestSchema.safeParse({ [field]: value }).success).toBe(false);
    }
  });
  it.each(['title', 'body', 'professionalName'])('PATCH preserva omissões e aceita alteração isolada de %s', (field) => {
    const value = { [field]: field === 'body' ? 'Outro texto válido.' : 'Outro título' };
    expect(UpdateReportRequestSchema.parse(value)).toEqual(value);
  });
  it.each([
    {}, undefined, null, [], { status: 'DRAFT' }, { id: reportId },
    { ...reportText, status: 'PUBLISHED' }, { title: 'Válido', publishedAt: timestamp },
  ])('rejeita PATCH vazio, sem campo reconhecido ou ampliado: %j', (value) => {
    expect(UpdateReportRequestSchema.safeParse(value).success).toBe(false);
  });
  it.each([{ ...reportText, status: 'DRAFT' }, { ...reportText, appointmentId }, { ...reportText, updatedAt: timestamp }])(
    'criação não admite estado, vínculo ou metadado: %j', (value) => {
      expect(CreateReportRequestSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('E2 RF-06 RF-07 RN-17 RN-20: laudo tem união discriminada e publicação coerente', () => {
  it('aceita DRAFT com publicação nula e PUBLISHED com instante exato', () => {
    expect(StaffReportSchema.parse(draft)).toEqual(draft);
    const value = { ...draft, status: 'PUBLISHED', publishedAt: timestamp };
    expect(StaffReportSchema.parse(value)).toEqual(value);
  });
  it('aplica a mesma normalização e limites aos textos do DTO', () => {
    expect(StaffReportSchema.parse({ ...draft, title: '  Exame fictício\n' }).title).toBe('Exame fictício');
    expect(StaffReportSchema.safeParse({ ...draft, title: `${'😀'.repeat(60)}a` }).success).toBe(false);
    expect(StaffReportSchema.safeParse({ ...draft, body: 'a'.repeat(9) }).success).toBe(false);
    expect(StaffReportSchema.safeParse({ ...draft, professionalName: 'ab' }).success).toBe(false);
  });
  it.each([
    { ...draft, publishedAt: timestamp }, { ...draft, status: 'PUBLISHED' },
    { ...draft, status: 'ARCHIVED' }, { ...draft, updatedAt: null },
    { ...draft, patient }, { ...draft, passwordHash: 'private' },
    { ...draft, publishedAt: undefined }, { ...draft, appointmentId: null },
  ])('rejeita publicação incoerente, campos extras ou obrigatórios inválidos: %j', (value) => {
    expect(StaffReportSchema.safeParse(value).success).toBe(false);
  });
});

describe('E1 E2 RF-08 RN-22 RN-23 RN-24: contrato próprio do paciente não amplia informação', () => {
  it.each([
    myAppointment, { ...myAppointment, hasPublishedReport: true },
    { ...myAppointment, status: 'CANCELED' },
  ])('aceita histórico próprio sem indício de rascunho: %j', (value) => {
    expect(MyAppointmentSchema.parse(value)).toEqual(value);
  });
  it.each([
    { ...myAppointment, status: 'CANCELED', hasPublishedReport: true },
    { ...myAppointment, hasPublishedReport: 'false' },
    { ...myAppointment, status: 'COMPLETED' },
    { ...myAppointment, patient }, { ...myAppointment, patientId: id },
    { ...myAppointment, report: null }, { ...myAppointment, reportId },
    { ...myAppointment, reportStatus: 'DRAFT' }, { ...myAppointment, passwordHash: 'private' },
    { ...myAppointment, examType: exam },
  ])('rejeita estado impossível ou revelação de entidade/rascunho: %j', (value) => {
    expect(MyAppointmentSchema.safeParse(value).success).toBe(false);
  });
  it('histórico admite vazio, cancelados e exame antigo sem janela implícita', () => {
    expect(MyAppointmentListResponseSchema.parse([])).toEqual([]);
    const value = [{ ...myAppointment, status: 'CANCELED', startsAt: '0001-01-01T12:00:00.000Z' }];
    expect(MyAppointmentListResponseSchema.parse(value)).toEqual(value);
    expect(MyAppointmentListResponseSchema.safeParse([{ ...myAppointment, patient }]).success).toBe(false);
  });
  it('laudo publicado expõe somente textos, publicação, exame por nome e horário', () => {
    expect(PublishedPatientReportSchema.parse(published)).toEqual(published);
    expect(PublishedPatientReportSchema.parse({ ...published, title: '  Exame fictício ' }).title).toBe('Exame fictício');
  });
  it.each([
    { id: reportId }, { appointmentId }, { status: 'PUBLISHED' }, { status: 'DRAFT' },
    { updatedAt: timestamp }, { patient }, { patientId: id }, { passwordHash: 'private' },
    { examType: examSummary }, { publishedAt: null }, { startsAt: null },
    { professionalName: null }, { title: 'ab' }, { body: 'a'.repeat(10_001) },
  ])('rejeita projeção ampliada ou publicação inválida: %j', (extra) => {
    expect(PublishedPatientReportSchema.safeParse({ ...published, ...extra }).success).toBe(false);
  });
});

describe('E1 E2: propriedades requeridas e objetos strict em todos os DTOs novos', () => {
  const objects = [
    { name: 'Patient', schema: PatientSchema, value: patient, fields: ['id', 'name', 'email'] },
    { name: 'PatientSummary', schema: PatientSummarySchema, value: patientSummary, fields: ['id', 'name'] },
    { name: 'ExamType', schema: ExamTypeSchema, value: exam, fields: ['id', 'code', 'name'] },
    { name: 'ExamTypeSummary', schema: ExamTypeSummarySchema, value: examSummary, fields: ['id', 'name'] },
    { name: 'ExamTypeName', schema: ExamTypeNameSchema, value: { name: exam.name }, fields: ['name'] },
    { name: 'ReportSummary', schema: ReportSummarySchema, value: { id: reportId, status: 'DRAFT' }, fields: ['id', 'status'] },
    { name: 'StaffAppointment', schema: StaffAppointmentSchema, value: appointment, fields: ['id', 'startsAt', 'status', 'patient', 'examType', 'report'] },
    { name: 'CreateAppointmentRequest', schema: CreateAppointmentRequestSchema, value: { patientId: id, examTypeId: examId, startsAt: timestamp }, fields: ['patientId', 'examTypeId', 'startsAt'] },
    { name: 'CreateReportRequest', schema: CreateReportRequestSchema, value: reportText, fields: ['title', 'body', 'professionalName'] },
    { name: 'StaffReport', schema: StaffReportSchema, value: draft, fields: ['id', 'appointmentId', 'title', 'body', 'professionalName', 'status', 'publishedAt', 'updatedAt'] },
    { name: 'MyAppointment', schema: MyAppointmentSchema, value: myAppointment, fields: ['id', 'startsAt', 'status', 'examType', 'hasPublishedReport'] },
    { name: 'PublishedPatientReport', schema: PublishedPatientReportSchema, value: published, fields: ['title', 'body', 'professionalName', 'publishedAt', 'examType', 'startsAt'] },
  ];
  for (const { name, schema, value, fields } of objects) {
    it.each(fields)(`${name} exige propriedade %s`, (field) => {
      const incomplete: Record<string, unknown> = { ...value };
      delete incomplete[field];
      expect(schema.safeParse(incomplete).success).toBe(false);
    });
    it(`${name} rejeita objeto ampliado, primitivo, array ou null sem coerção`, () => {
      for (const invalid of [{ ...value, extra: true }, null, [], '', 1, true, undefined]) {
        expect(schema.safeParse(invalid).success).toBe(false);
      }
    });
  }
});
