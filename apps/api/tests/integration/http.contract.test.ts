import { describe, expect, it } from 'vitest';
import { ErrorResponseSchema } from '@drlaudo/contract';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

interface ProtectedRoute {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  access: 'any' | 'STAFF' | 'PATIENT';
  payload?: Record<string, string>;
}

const protectedRoutes: ProtectedRoute[] = [
  { method: 'GET', url: '/auth/me', access: 'any' },
  { method: 'GET', url: '/patients', access: 'STAFF' },
  {
    method: 'POST', url: '/patients', access: 'STAFF',
    payload: { name: 'Paciente protegido QA', email: 'protegido@qa.test', password: QA.password },
  },
  { method: 'PATCH', url: `/patients/${QA.anaId}`, access: 'STAFF', payload: { name: 'Nome indevido QA' } },
  { method: 'GET', url: '/exam-types', access: 'STAFF' },
  { method: 'GET', url: '/slots?date=2026-11-10', access: 'STAFF' },
  { method: 'GET', url: '/appointments', access: 'STAFF' },
  {
    method: 'POST', url: '/appointments', access: 'STAFF',
    payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z' },
  },
  { method: 'GET', url: `/appointments/${QA.anaId}`, access: 'STAFF' },
  { method: 'POST', url: `/appointments/${QA.anaId}/cancel`, access: 'STAFF' },
  { method: 'GET', url: `/appointments/${QA.anaId}/report`, access: 'STAFF' },
  {
    method: 'POST', url: `/appointments/${QA.anaId}/report`, access: 'STAFF',
    payload: { title: 'Laudo protegido', body: 'Conteúdo fictício protegido para QA.', professionalName: 'Dra. QA' },
  },
  { method: 'PATCH', url: `/reports/${QA.anaId}`, access: 'STAFF', payload: { title: 'Edição indevida' } },
  { method: 'POST', url: `/reports/${QA.anaId}/publish`, access: 'STAFF' },
  { method: 'GET', url: '/me/appointments', access: 'PATIENT' },
  { method: 'GET', url: `/me/appointments/${QA.anaId}/report`, access: 'PATIENT' },
];

const publicRoutes = [
  { method: 'GET' as const, url: '/health', access: 'public' as const },
  {
    method: 'POST' as const, url: '/auth/login', access: 'public' as const,
    payload: { email: 'ana@qa.test', password: QA.password },
  },
];
const noBodyRoutes = [
  publicRoutes[0],
  ...protectedRoutes.filter((route) => route.payload === undefined),
].filter((route) => route !== undefined);
const allRoutes = [...publicRoutes, ...protectedRoutes];

function withQuery(url: string, query: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

async function databaseState() {
  const db = testPrisma();
  return {
    users: await db.user.findMany({ orderBy: { id: 'asc' } }),
    appointments: await db.appointment.findMany({ orderBy: { id: 'asc' } }),
    reports: await db.report.findMany({ orderBy: { id: 'asc' } }),
    exams: await db.examType.findMany({ orderBy: { id: 'asc' } }),
  };
}

describe('Contrato HTTP real', () => {
  it('health responde 200 com corpo exato e sem cache', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rota ou método desconhecido responde 404 canônico', async () => {
    const app = await buildTestApp();
    const unknown = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' },
    });
    const wrongMethod = await app.inject({ method: 'DELETE', url: '/patients' });
    expect(wrongMethod.statusCode).toBe(404);
  });

  it('query repetida é rejeitada antes de validar valores', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: '/appointments?date=2026-11-10&date=2026-11-10',
      headers: auth(token),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      {
        location: 'query',
        path: ['date'],
        rule: 'DUPLICATE_QUERY',
        message: 'Informe este parâmetro uma única vez.',
      },
    ]);
  });

  it('corpo não vazio em rota sem corpo responde UNEXPECTED_BODY', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'POST',
      url: '/appointments/aaaaaaaa-0000-4000-8000-000000000001/cancel',
      headers: auth(token),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      {
        location: 'body',
        path: [],
        rule: 'UNEXPECTED_BODY',
        message: 'Não envie corpo nesta requisição.',
      },
    ]);
  });

  it('JSON malformado responde INVALID_JSON sem detalhes de framework', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([
      { location: 'body', path: [], rule: 'INVALID_JSON', message: 'Envie JSON válido.' },
    ]);
  });

  it('distingue campo ausente, tipo inválido e chave desconhecida', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');

    const missing = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z' },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details).toEqual([
      { location: 'body', path: ['patientId'], rule: 'REQUIRED', message: 'Campo obrigatório.' },
    ]);

    const wrongType = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: 42, examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z' },
    });
    expect(wrongType.json().error.details).toEqual([
      { location: 'body', path: ['patientId'], rule: 'INVALID_TYPE', message: 'Tipo de valor inválido.' },
    ]);

    const unknown = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: {
        patientId: QA.anaId,
        examTypeId: QA.xrayId,
        startsAt: '2026-11-10T13:00:00.000Z',
        extra: true,
      },
    });
    expect(unknown.json().error.details).toEqual([
      { location: 'body', path: ['extra'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.' },
    ]);
  });

  it('exige UUID do agendamento antes de consultar existência', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const invalid = await app.inject({
      method: 'GET',
      url: '/appointments/nao-e-uuid',
      headers: auth(token),
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.details[0]).toMatchObject({ location: 'params', path: ['id'], rule: 'INVALID_FORMAT' });

    const valid = await app.inject({
      method: 'GET',
      url: '/appointments/ffffffff-ffff-4fff-8fff-ffffffffffff',
      headers: auth(token),
    });
    expect(valid.statusCode).toBe(404);
  });

  it('erro de autenticação precede corpo malformado', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: { 'content-type': 'application/json' },
      payload: '{invalido',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('Matriz de autenticação e autorização de todas as rotas protegidas', () => {
  it.each(protectedRoutes)('$method $url rejeita ausência e assinatura inválida sem persistir', async (route) => {
    const app = await buildTestApp();
    const before = await databaseState();
    const credentials: Record<string, string>[] = [{}, auth('token-sem-assinatura-valida')];
    for (const headers of credentials) {
      const response = await app.inject({
        method: route.method, url: route.url, headers,
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(response.statusCode).toBe(401);
      expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('UNAUTHORIZED');
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await databaseState()).toEqual(before);
  });

  it.each(protectedRoutes.filter((route) => route.access !== 'any'))('$method $url rejeita perfil oposto antes de acessar recurso ou corpo', async (route) => {
    const app = await buildTestApp();
    const token = await login(app, route.access === 'STAFF' ? 'ana@qa.test' : 'equipe@qa.test');
    const before = await databaseState();
    const response = await app.inject({
      method: route.method, url: route.url, headers: auth(token),
      ...(route.payload ? { payload: route.payload } : {}),
    });
    expect(response.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('FORBIDDEN');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await databaseState()).toEqual(before);
  });

  it('auth/me permite os dois perfis com identidade autenticada, sem campos privados', async () => {
    const app = await buildTestApp();
    for (const user of [
      { email: 'ana@qa.test', id: QA.anaId, name: 'Ana QA', role: 'PATIENT' },
      { email: 'equipe@qa.test', id: QA.staffId, name: 'Equipe QA', role: 'STAFF' },
    ]) {
      const token = await login(app, user.email);
      const response = await app.inject({
        method: 'GET', url: '/auth/me', headers: auth(token),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(user);
      expect(response.body).not.toContain('password');
    }
  });
});

describe('Validação de queries e catálogo persistido', () => {
  it.each([
    {
      url: '/slots?date=2026-11-10&date=invalida',
      field: 'date',
    },
    {
      url: `/appointments?patientId=${QA.anaId}&patientId=${QA.brunoId}`,
      field: 'patientId',
    },
  ])('$url rejeita duplicata antes dos valores e sem alterar dados', async ({ url, field }) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const before = await databaseState();
    const response = await app.inject({ method: 'GET', url, headers: auth(token) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([{
      location: 'query', path: [field], rule: 'DUPLICATE_QUERY',
      message: 'Informe este parâmetro uma única vez.',
    }]);
    expect(await databaseState()).toEqual(before);
  });

  it.each([
    '/slots?date=2026-02-30',
    '/slots?date=2026-11-10&extra=true',
    '/appointments?date=2026-02-30',
    '/appointments?patientId=invalido',
    '/appointments?extra=true',
  ])('%s não aceita data, identificador ou filtro desconhecido', async (url) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({ method: 'GET', url, headers: auth(token) });
    expect(response.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('catálogo retorna todos os exames em ordem por nome com somente o DTO público', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({ method: 'GET', url: '/exam-types', headers: auth(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: QA.xrayId, code: 'XRAY', name: 'Raio-X de tórax' },
      { id: QA.mriId, code: 'MRI', name: 'Ressonância de crânio' },
      { id: QA.ultrasoundId, code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
    ]);
    await testPrisma().examType.updateMany({ data: { name: 'Exame QA' } });
    const tied = await app.inject({ method: 'GET', url: '/exam-types', headers: auth(token) });
    expect(tied.statusCode).toBe(200);
    expect(tied.json<{ id: string }[]>().map((exam) => exam.id)).toEqual([
      QA.xrayId, QA.ultrasoundId, QA.mriId,
    ]);
  });

  it('catálogo vazio é lista vazia, mas registro inválido é erro canônico, não sucesso vazio', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    await testPrisma().examType.update({ where: { id: QA.xrayId }, data: { name: '' } });
    const invalid = await app.inject({ method: 'GET', url: '/exam-types', headers: auth(token) });
    expect(invalid.statusCode).toBe(500);
    expect(invalid.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' },
    });
    await testPrisma().examType.deleteMany();
    const empty = await app.inject({ method: 'GET', url: '/exam-types', headers: auth(token) });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
  });
});

describe('Fronteira strict de todas as rotas · query, corpo e precedência', () => {
  it.each(allRoutes)('$method $url recusa query desconhecida em vez de ignorá-la', async (route) => {
    const app = await buildTestApp();
    const token = route.access === 'public'
      ? undefined
      : await login(app, route.access === 'PATIENT' ? 'ana@qa.test' : 'equipe@qa.test');
    const before = await databaseState();
    const response = await app.inject({
      method: route.method, url: withQuery(route.url, 'extra=valor'),
      ...(token ? { headers: auth(token) } : {}),
      ...('payload' in route && route.payload ? { payload: route.payload } : {}),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([{
      location: 'query', path: ['extra'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.',
    }]);
    expect(await databaseState()).toEqual(before);
  });

  it.each(noBodyRoutes)('$method $url trata qualquer byte como UNEXPECTED_BODY antes do parser', async (route) => {
    const app = await buildTestApp();
    const token = route.access === 'public'
      ? undefined
      : await login(app, route.access === 'PATIENT' ? 'ana@qa.test' : 'equipe@qa.test');
    const before = await databaseState();
    for (const body of [
      { payload: '{}', contentType: 'application/json' },
      { payload: 'null', contentType: 'application/json' },
      { payload: '[]', contentType: 'application/json' },
      { payload: '"texto"', contentType: 'application/json' },
      { payload: '{malformado', contentType: 'application/json' },
      { payload: 'texto', contentType: 'text/plain' },
      { payload: ' ', contentType: 'application/octet-stream' },
    ]) {
      const response = await app.inject({
        method: route.method, url: route.url,
        headers: { ...(token ? auth(token) : {}), 'content-type': body.contentType },
        payload: body.payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([{
        location: 'body', path: [], rule: 'UNEXPECTED_BODY',
        message: 'Não envie corpo nesta requisição.',
      }]);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await databaseState()).toEqual(before);
  });

  it('GET público e protegido com zero bytes aceita Content-Type sem tentar parsear', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    for (const url of ['/health', '/patients']) {
      const response = await app.inject({
        method: 'GET', url, headers: { ...auth(token), 'content-type': 'application/json' }, payload: '',
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it.each([
    { method: 'POST' as const, url: '/auth/login', payload: { email: 'ana@qa.test', password: QA.password }, public: true },
    { method: 'POST' as const, url: '/patients', payload: { name: 'Pessoa QA', email: 'nova@qa.test', password: QA.password }, public: false },
    { method: 'PATCH' as const, url: `/patients/${QA.anaId}`, payload: { name: 'Nome QA' }, public: false },
    { method: 'POST' as const, url: '/appointments', payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z' }, public: false },
    { method: 'POST' as const, url: `/appointments/${QA.anaId}/report`, payload: { title: 'Laudo QA', body: 'Conteúdo fictício de laudo QA.', professionalName: 'Dra. QA' }, public: false },
    { method: 'PATCH' as const, url: `/reports/${QA.anaId}`, payload: { title: 'Laudo QA' }, public: false },
  ])('$method $url exige JSON e distingue ausência, Content-Type e sintaxe sem persistir', async (route) => {
    const app = await buildTestApp();
    const token = route.public ? undefined : await login(app, 'equipe@qa.test');
    const before = await databaseState();
    for (const input of [
      { payload: undefined, contentType: 'application/json', rule: 'REQUIRED' },
      { payload: '', contentType: 'text/plain', rule: 'REQUIRED' },
      { payload: JSON.stringify(route.payload), contentType: 'text/plain', rule: 'INVALID_FORMAT' },
      { payload: '{invalido', contentType: 'application/json', rule: 'INVALID_JSON' },
      { payload: 'null', contentType: 'application/json', rule: 'INVALID_TYPE' },
      { payload: '[]', contentType: 'application/json', rule: 'INVALID_TYPE' },
    ]) {
      const response = await app.inject({
        method: route.method, url: route.url,
        headers: { ...(token ? auth(token) : {}), 'content-type': input.contentType },
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ location: 'body', path: [], rule: input.rule }),
      ]);
    }
    expect(await databaseState()).toEqual(before);
  });

  it('agrega params/query/body em ordem canônica, sem omitir falhas independentes', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const before = await databaseState();
    const response = await app.inject({
      method: 'PATCH', url: '/reports/nao-uuid?z=1&extra=1&extra=2',
      headers: auth(token), payload: { title: 42, professionalName: 'x', body: 'curto' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.',
        details: [
          { location: 'params', path: ['id'], rule: 'INVALID_FORMAT', message: 'Formato de valor inválido.' },
          { location: 'query', path: ['extra'], rule: 'DUPLICATE_QUERY', message: 'Informe este parâmetro uma única vez.' },
          { location: 'query', path: ['z'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.' },
          { location: 'body', path: ['body'], rule: 'TOO_SHORT', message: 'Valor menor que o limite permitido.' },
          { location: 'body', path: ['professionalName'], rule: 'TOO_SHORT', message: 'Valor menor que o limite permitido.' },
          { location: 'body', path: ['title'], rule: 'INVALID_TYPE', message: 'Tipo de valor inválido.' },
        ],
      },
    });
    expect(ErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(await databaseState()).toEqual(before);
  });

  it.each([
    { payload: '{invalido', contentType: 'application/json', rule: 'INVALID_JSON' },
    { payload: '{invalido', contentType: 'text/plain', rule: 'INVALID_FORMAT' },
  ])('agrega params e query com $rule de body sem vazar conteúdo', async ({ payload, contentType, rule }) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'PATCH', url: '/reports/nao-uuid?extra=true',
      headers: { ...auth(token), 'content-type': contentType }, payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ location: 'params', path: ['id'], rule: 'INVALID_FORMAT' }),
      expect.objectContaining({ location: 'query', path: ['extra'], rule: 'UNKNOWN_FIELD' }),
      expect.objectContaining({ location: 'body', path: [], rule }),
    ]);
    expect(response.body).not.toContain('invalido');
  });

  it('NoBody agrega formato de id e query sem trocar UNEXPECTED_BODY por INVALID_JSON', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'POST', url: '/reports/nao-uuid/publish?extra=true',
      headers: { ...auth(token), 'content-type': 'application/json' }, payload: '{invalido',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ location: 'params', path: ['id'], rule: 'INVALID_FORMAT' }),
      expect.objectContaining({ location: 'query', path: ['extra'], rule: 'UNKNOWN_FIELD' }),
      expect.objectContaining({ location: 'body', path: [], rule: 'UNEXPECTED_BODY' }),
    ]);
  });

  it.each([
    { actor: 'anonymous', expected: 401, code: 'UNAUTHORIZED' },
    { actor: 'patient', expected: 403, code: 'FORBIDDEN' },
  ])('$actor tem precedência sobre Content-Type, JSON, params e query', async ({ actor, expected, code }) => {
    const app = await buildTestApp();
    const token = actor === 'patient' ? await login(app, 'ana@qa.test') : undefined;
    const response = await app.inject({
      method: 'POST', url: '/reports/nao-uuid/publish?extra=true',
      headers: { ...(token ? auth(token) : {}), 'content-type': 'application/octet-stream' },
      payload: '{invalido',
    });
    expect(response.statusCode).toBe(expected);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe(code);
  });
});

describe('Detalhes de validação · agregação sem vazamento e regras únicas por chave', () => {
  it('PATCH só com desconhecido agrega EMPTY_PATCH e UNKNOWN_FIELD; tipo errado não vira ausência', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'PATCH', url: '/reports/ffffffff-ffff-4fff-8fff-ffffffffffff',
      headers: auth(token), payload: { extra: 'SENTINELA-NAO-DEVE-SAIR' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      { location: 'body', path: [], rule: 'EMPTY_PATCH', message: 'Informe ao menos um campo.' },
      { location: 'body', path: ['extra'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.' },
    ]);
    expect(response.body).not.toContain('SENTINELA');
    const invalid = await app.inject({
      method: 'PATCH', url: '/reports/ffffffff-ffff-4fff-8fff-ffffffffffff',
      headers: auth(token), payload: { title: null },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.details).toEqual([
      { location: 'body', path: ['title'], rule: 'INVALID_TYPE', message: 'Tipo de valor inválido.' },
    ]);
  });

  it('query plana mantém nomes literais e duplicata desconhecida emite somente DUPLICATE_QUERY', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: '/slots?date=invalida&date=invalida&date%5B%5D=2026-11-10&extra=1&extra=1',
      headers: auth(token),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      { location: 'query', path: ['date'], rule: 'DUPLICATE_QUERY', message: 'Informe este parâmetro uma única vez.' },
      { location: 'query', path: ['date[]'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.' },
      { location: 'query', path: ['extra'], rule: 'DUPLICATE_QUERY', message: 'Informe este parâmetro uma única vez.' },
    ]);
  });

  it('ordena chaves desconhecidas por pontos Unicode, não locale nem unidades UTF-16', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'PATCH', url: '/reports/ffffffff-ffff-4fff-8fff-ffffffffffff',
      headers: auth(token), payload: { title: 'Título válido', '😀': 'segredo', '\ue000': 'segredo', z: 'segredo', a: 'segredo' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual(['a', 'z', '\ue000', '😀'].map((key) => ({
      location: 'body', path: [key], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.',
    })));
    expect(response.body).not.toContain('segredo');
  });
});
