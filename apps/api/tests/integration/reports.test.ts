import { describe, expect, it } from 'vitest';
import { StaffReportSchema } from '@drlaudo/contract';
import { REPORT_INPUT } from '../helpers/report-scenario.ts';
import type { Clock } from '../../src/clock.ts';
import { buildApp } from '../../src/app.ts';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase, type TestApp } from '../helpers/setup.ts';

useIsolatedDatabase();

const SLOT = '2026-11-10T13:00:00.000Z';

function advancingClock(initial: string): { clock: Clock; set: (instant: string) => void } {
  let current = initial;
  return {
    clock: { now: () => new Date(current) },
    set: (instant: string) => {
      current = instant;
    },
  };
}

async function staffSetup() {
  const app = await buildTestApp();
  const token = await login(app, 'equipe@qa.test');
  const created = await app.inject({
    method: 'POST',
    url: '/appointments',
    headers: auth(token),
    payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: SLOT },
  });
  expect(created.statusCode).toBe(201);
  const appointment = created.json<{ id: string }>();
  return { app, token, appointmentId: appointment.id };
}

async function createDraft(
  app: TestApp,
  token: string,
  appointmentId: string,
) {
  const response = await app.inject({
    method: 'POST',
    url: `/appointments/${appointmentId}/report`,
    headers: auth(token),
    payload: {
      title: 'Laudo QA de tórax',
      body: 'Conteúdo fictício com mais de dez caracteres.',
      professionalName: 'Dra. QA',
    },
  });
  expect(response.statusCode).toBe(201);
  return StaffReportSchema.parse(response.json());
}

describe('RF-06/RN-14…18 · rascunho único e editável', () => {
  it('cria DRAFT com publicação nula e recusa um segundo laudo', async () => {
    const { app, token, appointmentId } = await staffSetup();
    const created = await app.inject({
      method: 'POST',
      url: `/appointments/${appointmentId}/report`,
      headers: auth(token),
      payload: {
        title: '  Laudo QA de tórax  ',
        body: '  Conteúdo fictício com mais de dez caracteres.  ',
        professionalName: '  Dra. QA  ',
      },
    });
    expect(created.statusCode).toBe(201);
    const body = StaffReportSchema.parse(created.json());
    expect(body).toEqual({
      id: body.id, appointmentId, ...REPORT_INPUT,
      status: 'DRAFT', publishedAt: null, updatedAt: QA.now,
    });
    const persisted = await testPrisma().report.findUniqueOrThrow({ where: { id: body.id } });
    expect(persisted).toEqual({
      id: body.id, appointmentId, ...REPORT_INPUT, status: 'DRAFT', publishedAt: null,
      createdAt: new Date(QA.now), updatedAt: new Date(QA.now),
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/appointments/${appointmentId}/report`,
      headers: auth(token),
      payload: {
        title: 'Outro laudo QA',
        body: 'Outro conteúdo fictício com mais de dez caracteres.',
        professionalName: 'Dra. QA',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('REPORT_EXISTS');
    expect(await testPrisma().report.findMany()).toEqual([persisted]);
  });

  it('PATCH parcial preserva campos omitidos e atualiza updatedAt pelo clock', async () => {
    const mutable = advancingClock(QA.now);
    const app = await buildApp({
      prisma: testPrisma(),
      clock: mutable.clock,
      config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', loginRateLimitMax: 10, trustProxyHops: 0 },
    });
    const token = await login(app, 'equipe@qa.test');
    const created = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: SLOT },
    });
    const appointmentId = created.json<{ id: string }>().id;
    const draft = await createDraft(app, token, appointmentId);
    const persistedBefore = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });

    mutable.set('2026-11-10T12:30:00.000Z');
    const patched = await app.inject({
      method: 'PATCH',
      url: `/reports/${draft.id}`,
      headers: auth(token),
      payload: { body: 'Corpo revisado fictício com mais de dez caracteres.' },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json();
    expect(body.body).toBe('Corpo revisado fictício com mais de dez caracteres.');
    expect(body.title).toBe('Laudo QA de tórax');
    expect(body.professionalName).toBe('Dra. QA');
    expect(body.updatedAt).toBe('2026-11-10T12:30:00.000Z');
    expect(body.status).toBe('DRAFT');
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual({
      ...persistedBefore,
      body: 'Corpo revisado fictício com mais de dez caracteres.',
      updatedAt: new Date('2026-11-10T12:30:00.000Z'),
    });
  });

  it('PATCH vazio responde 400 EMPTY_PATCH em path raiz', async () => {
    const { app, token, appointmentId } = await staffSetup();
    const draft = await createDraft(app, token, appointmentId);
    const response = await app.inject({
      method: 'PATCH',
      url: `/reports/${draft.id}`,
      headers: auth(token),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Os dados informados são inválidos.',
        details: [{ location: 'body', path: [], rule: 'EMPTY_PATCH', message: 'Informe ao menos um campo.' }],
      },
    });
  });
});

describe('RF-07/RN-19/RN-20 · publicação imutável', () => {
  it('publica registrando publishedAt e bloqueia edição e republicação', async () => {
    const { app, token, appointmentId } = await staffSetup();
    const draft = await createDraft(app, token, appointmentId);
    const before = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });
    const appointmentBefore = await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointmentId } });

    const published = await app.inject({
      method: 'POST',
      url: `/reports/${draft.id}/publish`,
      headers: auth(token),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('PUBLISHED');
    expect(published.json().publishedAt).toBe(QA.now);
    const expected = {
      ...before, status: 'PUBLISHED' as const,
      publishedAt: new Date(QA.now), updatedAt: new Date(QA.now),
    };
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(expected);

    const edit = await app.inject({
      method: 'PATCH',
      url: `/reports/${draft.id}`,
      headers: auth(token),
      payload: { title: 'Tentativa de edição' },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().error.code).toBe('REPORT_LOCKED');

    const republish = await app.inject({
      method: 'POST',
      url: `/reports/${draft.id}/publish`,
      headers: auth(token),
    });
    expect(republish.statusCode).toBe(409);
    expect(republish.json().error.code).toBe('REPORT_LOCKED');
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(expected);
    expect(await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointmentId } })).toEqual(appointmentBefore);
  });

  it('agendamento cancelado bloqueia criar, editar e publicar laudo', async () => {
    const { app, token, appointmentId } = await staffSetup();
    const draft = await createDraft(app, token, appointmentId);
    await app.inject({ method: 'POST', url: `/appointments/${appointmentId}/cancel`, headers: auth(token) });

    const publish = await app.inject({
      method: 'POST',
      url: `/reports/${draft.id}/publish`,
      headers: auth(token),
    });
    expect(publish.statusCode).toBe(409);
    expect(publish.json().error.code).toBe('APPOINTMENT_CANCELED');

    const edit = await app.inject({
      method: 'PATCH',
      url: `/reports/${draft.id}`,
      headers: auth(token),
      payload: { title: 'Edição bloqueada' },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().error.code).toBe('APPOINTMENT_CANCELED');

    const other = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.brunoId, examTypeId: QA.ultrasoundId, startsAt: '2026-11-10T13:30:00.000Z' },
    });
    const otherId = other.json<{ id: string }>().id;
    await app.inject({ method: 'POST', url: `/appointments/${otherId}/cancel`, headers: auth(token) });
    const create = await app.inject({
      method: 'POST',
      url: `/appointments/${otherId}/report`,
      headers: auth(token),
      payload: {
        title: 'Laudo em cancelado',
        body: 'Conteúdo fictício com mais de dez caracteres.',
        professionalName: 'Dra. QA',
      },
    });
    expect(create.statusCode).toBe(409);
    expect(create.json().error.code).toBe('APPOINTMENT_CANCELED');
  });
});


describe('Atomicidade de laudos diante de DTO persistido inválido', () => {
  it.each(['update', 'publish'] as const)('%s não confirma alteração se a saída viola o contrato', async (operation) => {
    const { app, token, appointmentId } = await staffSetup();
    const draft = await createDraft(app, token, appointmentId);
    await testPrisma().report.update({ where: { id: draft.id }, data: { title: '' } });
    const before = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });
    const appointmentBefore = await testPrisma().appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    const response = operation === 'update'
      ? await app.inject({
        method: 'PATCH', url: `/reports/${draft.id}`, headers: auth(token),
        payload: { body: 'Conteúdo alterado que precisa sofrer rollback.' },
      })
      : await app.inject({
        method: 'POST', url: `/reports/${draft.id}/publish`, headers: auth(token),
      });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
    expect(await testPrisma().appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    })).toEqual(appointmentBefore);
  });
});

describe('Campos de laudo · limites, tipos e propriedades imutáveis', () => {
  it.each([
    { field: 'title', value: 'xx', rule: 'TOO_SHORT' },
    { field: 'title', value: 'x'.repeat(121), rule: 'TOO_LONG' },
    { field: 'title', value: '😃', rule: 'TOO_SHORT' },
    { field: 'body', value: 'x'.repeat(9), rule: 'TOO_SHORT' },
    { field: 'body', value: 'x'.repeat(10_001), rule: 'TOO_LONG' },
    { field: 'professionalName', value: 'xx', rule: 'TOO_SHORT' },
    { field: 'professionalName', value: 'x'.repeat(121), rule: 'TOO_LONG' },
    { field: 'title', value: null, rule: 'INVALID_TYPE' },
    { field: 'body', value: 42, rule: 'INVALID_TYPE' },
  ])('$field/$rule não cria nem altera conteúdo ou timestamps', async ({ field, value, rule }) => {
    const { app, token, appointmentId } = await staffSetup();
    const invalidCreate = await app.inject({
      method: 'POST', url: `/appointments/${appointmentId}/report`, headers: auth(token),
      payload: { ...REPORT_INPUT, [field]: value },
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidCreate.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: [field], rule }),
    ]);
    expect(await testPrisma().report.count()).toBe(0);
    const draft = await createDraft(app, token, appointmentId);
    const before = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });
    const invalidPatch = await app.inject({
      method: 'PATCH', url: `/reports/${draft.id}`, headers: auth(token),
      payload: { [field]: value },
    });
    expect(invalidPatch.statusCode).toBe(400);
    expect(invalidPatch.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: [field], rule }),
    ]);
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
  });

  it.each(['id', 'appointmentId', 'status', 'publishedAt', 'updatedAt', 'createdAt'])('%s não pode ser definido pelo cliente na criação ou edição', async (field) => {
    const { app, token, appointmentId } = await staffSetup();
    const create = await app.inject({
      method: 'POST', url: `/appointments/${appointmentId}/report`, headers: auth(token),
      payload: { ...REPORT_INPUT, [field]: 'valor indevido' },
    });
    expect(create.statusCode).toBe(400);
    expect(create.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: [field], rule: 'UNKNOWN_FIELD' }),
    ]);
    expect(await testPrisma().report.count()).toBe(0);
    const draft = await createDraft(app, token, appointmentId);
    const before = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });
    const patch = await app.inject({
      method: 'PATCH', url: `/reports/${draft.id}`, headers: auth(token),
      payload: { title: 'Título permitido', [field]: 'valor indevido' },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: [field], rule: 'UNKNOWN_FIELD' }),
    ]);
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
  });

  it.each([
    { title: 'abc', body: '0123456789', professionalName: 'def' },
    { title: '😃'.repeat(60), body: '😃'.repeat(5_000), professionalName: '😃'.repeat(60) },
  ])('aceita extremos inclusivos medidos em UTF-16 e persiste texto sem espaços externos', async (input) => {
    const { app, token, appointmentId } = await staffSetup();
    const response = await app.inject({
      method: 'POST', url: `/appointments/${appointmentId}/report`, headers: auth(token),
      payload: {
        title: `  ${input.title}  `, body: `  ${input.body}  `,
        professionalName: `  ${input.professionalName}  `,
      },
    });
    expect(response.statusCode).toBe(201);
    const created = StaffReportSchema.parse(response.json());
    expect(created).toEqual({
      id: created.id, appointmentId, ...input, status: 'DRAFT', updatedAt: QA.now, publishedAt: null,
    });
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: created.id } })).toEqual({
      id: created.id, appointmentId, ...input, status: 'DRAFT', publishedAt: null,
      createdAt: new Date(QA.now), updatedAt: new Date(QA.now),
    });
  });

  it('laudos/agendamentos inexistentes compartilham 404 e nenhuma escrita', async () => {
    const { app, token, appointmentId } = await staffSetup();
    const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const before = await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: `/appointments/${appointmentId}/report`, headers: auth(token) }),
      app.inject({ method: 'GET', url: `/appointments/${missing}/report`, headers: auth(token) }),
      app.inject({ method: 'POST', url: `/appointments/${missing}/report`, headers: auth(token), payload: REPORT_INPUT }),
      app.inject({ method: 'PATCH', url: `/reports/${missing}`, headers: auth(token), payload: { title: 'Título permitido' } }),
      app.inject({ method: 'POST', url: `/reports/${missing}/publish`, headers: auth(token) }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}');
    }
    expect(await testPrisma().report.count()).toBe(0);
    expect(await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointmentId } })).toEqual(before);
  });
});

describe('Timestamps · escrita explícita do clock e imutabilidade após publicar', () => {
  it('mantém createdAt, avança updatedAt/publishedAt e não toca nada em rejeições posteriores', async () => {
    const mutable = advancingClock(QA.now);
    const app = await buildApp({
      prisma: testPrisma(), clock: mutable.clock,
      config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', loginRateLimitMax: 10, trustProxyHops: 0 },
    });
    const token = await login(app, 'equipe@qa.test');
    const created = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: SLOT },
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = created.json<{ id: string }>().id;
    const draft = await createDraft(app, token, appointmentId);
    const before = await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } });
    mutable.set('2026-11-10T12:30:00.000Z');
    const published = await app.inject({
      method: 'POST', url: `/reports/${draft.id}/publish`, headers: auth(token),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toEqual({
      ...draft, status: 'PUBLISHED', publishedAt: '2026-11-10T12:30:00.000Z',
      updatedAt: '2026-11-10T12:30:00.000Z',
    });
    const expected = {
      ...before, status: 'PUBLISHED',
      publishedAt: new Date('2026-11-10T12:30:00.000Z'),
      updatedAt: new Date('2026-11-10T12:30:00.000Z'),
    };
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(expected);
    mutable.set('2026-11-10T14:00:00.000Z');
    const empty = await app.inject({
      method: 'PATCH', url: `/reports/${draft.id}`, headers: auth(token), payload: {},
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.details[0].rule).toBe('EMPTY_PATCH');
    const edit = await app.inject({
      method: 'PATCH', url: `/reports/${draft.id}`, headers: auth(token),
      payload: { title: 'Edição posterior proibida' },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().error.code).toBe('REPORT_LOCKED');
    const repeat = await app.inject({
      method: 'POST', url: `/reports/${draft.id}/publish`, headers: auth(token),
    });
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json().error.code).toBe('REPORT_LOCKED');
    expect(await testPrisma().report.findMany()).toEqual([expected]);
  });
});
