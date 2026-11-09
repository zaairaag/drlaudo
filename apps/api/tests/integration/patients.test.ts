import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ErrorResponseSchema, PatientListResponseSchema, PatientSchema } from '@drlaudo/contract';
import { describe, expect, it } from 'vitest';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

const patientInput = { name: ' Nova Paciente ', email: ' NOVA@QA.TEST ', password: ' senha literal ' };
const conflict = { error: { code: 'EMAIL_TAKEN', message: 'Este e-mail já está cadastrado.' } };

describe('administração de pacientes · contrato STAFF', () => {
  it('cadastra PATIENT com hash bcrypt10 e permite login literal sem expor hash ou role no DTO', async () => {
    const app = await buildTestApp();
    const staffToken = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'POST', url: '/patients', headers: auth(staffToken), payload: patientInput,
    });
    expect(response.statusCode).toBe(201);
    const patient = PatientSchema.parse(response.json());
    expect(patient).toEqual({ id: expect.any(String), name: 'Nova Paciente', email: 'nova@qa.test' });
    const stored = await testPrisma().user.findUniqueOrThrow({ where: { id: patient.id } });
    expect(stored.role).toBe('PATIENT');
    expect(stored.passwordHash).not.toBe(patientInput.password);
    expect(bcrypt.getRounds(stored.passwordHash)).toBe(10);
    expect(await bcrypt.compare(patientInput.password, stored.passwordHash)).toBe(true);
    expect(stored.createdAt.toISOString()).toBe(QA.now);
    const loggedIn = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: patient.email, password: patientInput.password },
    });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().user).toMatchObject({ id: patient.id, role: 'PATIENT' });
    const wrongLiteral = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: patient.email, password: patientInput.password.trim() },
    });
    expect(wrongLiteral.statusCode).toBe(401);
  });

  it('edita somente nome/e-mail e preserva hash, perfil, criação e histórico', async () => {
    const db = testPrisma();
    const before = await db.user.findUniqueOrThrow({ where: { id: QA.anaId } });
    const appointment = await db.appointment.create({
      data: {
        id: randomUUID(), patientId: QA.anaId, examTypeId: QA.xrayId,
        startsAt: new Date('2026-11-10T13:00:00.000Z'), status: 'SCHEDULED',
      },
    });
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const changed = await app.inject({
      method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token),
      payload: { name: ' Ana Atualizada ', email: ' ANA.NOVA@QA.TEST ' },
    });
    expect(changed.statusCode).toBe(200);
    expect(PatientSchema.parse(changed.json())).toEqual({
      id: QA.anaId, name: 'Ana Atualizada', email: 'ana.nova@qa.test',
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: QA.anaId } });
    expect(after).toEqual({ ...before, name: 'Ana Atualizada', email: 'ana.nova@qa.test' });
    expect(await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual(appointment);
    const emailOnly = await app.inject({
      method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token),
      payload: { email: ' ANA.NOVA@QA.TEST ' },
    });
    expect(emailOnly.statusCode).toBe(200);
    const nameOnly = await app.inject({
      method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token),
      payload: { name: 'Ana Somente Nome' },
    });
    expect(nameOnly.statusCode).toBe(200);
    expect(nameOnly.json().email).toBe('ana.nova@qa.test');
  });

  it('lista completa exclui STAFF e ordena por pontos de código Unicode, depois id', async () => {
    const db = testPrisma();
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: QA.anaId } });
    await db.user.createMany({
      data: [
        { id: '77777777-7777-4777-8777-777777777777', name: 'Ana QA', email: 'ana2@qa.test', passwordHash, role: 'PATIENT' },
        { id: '88888888-8888-4888-8888-888888888888', name: '\uE000 QA', email: 'bmp@qa.test', passwordHash, role: 'PATIENT' },
        { id: '99999999-9999-4999-8999-999999999999', name: '\u{10000} QA', email: 'supplementar@qa.test', passwordHash, role: 'PATIENT' },
      ],
    });
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({ method: 'GET', url: '/patients', headers: auth(token) });
    expect(response.statusCode).toBe(200);
    const rows = PatientListResponseSchema.parse(response.json());
    expect(rows.map(({ id }) => id)).toEqual([
      QA.anaId, '77777777-7777-4777-8777-777777777777', QA.brunoId,
      '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999',
    ]);
  });

  it.each(['POST', 'PATCH'] as const)('%s exige autenticação e perfil STAFF antes da validação', async (method) => {
    const app = await buildTestApp();
    const patient = await login(app, 'ana@qa.test');
    const url = method === 'POST' ? '/patients' : `/patients/${QA.brunoId}`;
    for (const [headers, status] of [[{}, 401], [auth(patient), 403]] as const) {
      const response = await app.inject({ method, url, headers, payload: {} });
      expect(response.statusCode).toBe(status);
      expect(ErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    }
    expect(await testPrisma().user.count()).toBe(3);
  });

  it.each([QA.staffId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])('editar STAFF ou inexistente é o mesmo 404: %s', async (id) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const before = await testPrisma().user.findMany({ orderBy: { id: 'asc' } });
    const response = await app.inject({
      method: 'PATCH', url: `/patients/${id}`, headers: auth(token), payload: { name: 'Nome Alterado' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    expect(await testPrisma().user.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('e-mail já usado por paciente ou equipe é conflito conhecido, sem persistência parcial', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const before = await testPrisma().user.findMany({ orderBy: { id: 'asc' } });
    for (const email of [' ANA@QA.TEST ', ' EQUIPE@QA.TEST ']) {
      const created = await app.inject({
        method: 'POST', url: '/patients', headers: auth(token), payload: { ...patientInput, email },
      });
      expect(created.statusCode).toBe(409);
      expect(created.json()).toEqual(conflict);
      expect(ErrorResponseSchema.safeParse(created.json()).success).toBe(true);
      const edited = await app.inject({
        method: 'PATCH', url: `/patients/${QA.brunoId}`, headers: auth(token),
        payload: { name: 'Não Deve Persistir', email },
      });
      expect(edited.statusCode).toBe(409);
      expect(edited.json()).toEqual(conflict);
    }
    expect(await testPrisma().user.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('duas criações concorrentes para o mesmo e-mail têm um único vencedor', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const responses = await Promise.all([1, 2].map(() => app.inject({
      method: 'POST', url: '/patients', headers: auth(token), payload: patientInput,
    })));
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(await testPrisma().user.count({ where: { email: 'nova@qa.test' } })).toBe(1);
    expect(responses.find((response) => response.statusCode === 409)?.json()).toEqual(conflict);
  });

  it.each([
    { payload: { name: ' x ', email: 'novo@qa.test', password: '12345678' }, path: 'name', rule: 'TOO_SHORT' },
    { payload: { name: 'n'.repeat(121), email: 'novo@qa.test', password: '12345678' }, path: 'name', rule: 'TOO_LONG' },
    { payload: { name: 'Nome Válido', email: 'invalido', password: '12345678' }, path: 'email', rule: 'INVALID_FORMAT' },
    { payload: { name: 'Nome Válido', email: 'novo@qa.test', password: '1234567' }, path: 'password', rule: 'TOO_SHORT' },
    { payload: { name: 'Nome Válido', email: 'novo@qa.test', password: 'é'.repeat(37) }, path: 'password', rule: 'TOO_LONG' },
    { payload: { name: 'Nome Válido', email: 'novo@qa.test', password: '😀'.repeat(19) }, path: 'password', rule: 'TOO_LONG' },
    { payload: { name: 'Nome Válido', email: 'novo@qa.test', password: '12345678', role: 'STAFF' }, path: 'role', rule: 'UNKNOWN_FIELD' },
  ])('valida criação $path/$rule e não grava', async ({ payload, path, rule }) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({ method: 'POST', url: '/patients', headers: auth(token), payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toContainEqual(expect.objectContaining({ location: 'body', path: [path], rule }));
    expect(await testPrisma().user.count()).toBe(3);
  });

  it.each([
    { payload: {}, path: [], rule: 'EMPTY_PATCH' },
    { payload: { password: 'Nova@1234' }, path: ['password'], rule: 'UNKNOWN_FIELD' },
    { payload: { role: 'STAFF' }, path: ['role'], rule: 'UNKNOWN_FIELD' },
    { payload: { name: null }, path: ['name'], rule: 'INVALID_TYPE' },
  ])('rejeita patch inválido sem mudar dados: $rule', async ({ payload, path, rule }) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const before = await testPrisma().user.findUniqueOrThrow({ where: { id: QA.anaId } });
    const response = await app.inject({ method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toContainEqual(expect.objectContaining({ location: 'body', path, rule }));
    expect(await testPrisma().user.findUniqueOrThrow({ where: { id: QA.anaId } })).toEqual(before);
  });

  it('aceita limite bcrypt de 72 bytes e conta nome/senha em UTF-16 conforme contrato', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'POST', url: '/patients', headers: auth(token),
      payload: { name: '😀'.repeat(60), email: 'limite@qa.test', password: 'é'.repeat(36) },
    });
    expect(response.statusCode).toBe(201);
    const stored = await testPrisma().user.findUniqueOrThrow({ where: { email: 'limite@qa.test' } });
    expect(await bcrypt.compare('é'.repeat(36), stored.passwordHash)).toBe(true);
  });

  it('paciente cadastrado enxerga somente appointments do próprio sub', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const created = await app.inject({
      method: 'POST', url: '/patients', headers: auth(token), payload: patientInput,
    });
    expect(created.statusCode).toBe(201);
    const patient = PatientSchema.parse(created.json());
    const ownId = randomUUID();
    await testPrisma().appointment.createMany({ data: [
      { id: ownId, patientId: patient.id, examTypeId: QA.xrayId, startsAt: new Date('2026-11-10T13:00:00.000Z') },
      { id: randomUUID(), patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: new Date('2026-11-10T13:30:00.000Z') },
    ] });
    const patientToken = await login(app, patient.email, patientInput.password);
    const own = await app.inject({ method: 'GET', url: '/me/appointments', headers: auth(patientToken) });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual([expect.objectContaining({ id: ownId })]);
  });
});

describe('pacientes · atomicidade da resposta', () => {
  it('PATCH inválido na saída retorna 500 e desfaz a edição no banco real', async () => {
    const db = testPrisma();
    await db.user.update({ where: { id: QA.brunoId }, data: { email: 'email-legado-invalido' } });
    const before = await db.user.findUniqueOrThrow({ where: { id: QA.brunoId } });
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'PATCH', url: `/patients/${QA.brunoId}`, headers: auth(token),
      payload: { name: 'Nome que não pode persistir' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(await db.user.findUniqueOrThrow({ where: { id: QA.brunoId } })).toEqual(before);
  });

  it('PATCH concorrente de e-mail tem um vencedor e preserva o perdedor integralmente', async () => {
    const db = testPrisma();
    const before = await db.user.findMany({
      where: { role: 'PATIENT' }, orderBy: { id: 'asc' },
    });
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const responses = await Promise.all([QA.anaId, QA.brunoId].map((id) => app.inject({
      method: 'PATCH', url: `/patients/${id}`, headers: auth(token),
      payload: { name: 'Nome Concorrente', email: 'concorrente@qa.test' },
    })));
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const winnerIndex = responses.findIndex((response) => response.statusCode === 200);
    for (const [index, row] of before.entries()) {
      const stored = await db.user.findUniqueOrThrow({ where: { id: row.id } });
      expect(stored).toEqual(index === winnerIndex
        ? { ...row, name: 'Nome Concorrente', email: 'concorrente@qa.test' }
        : row);
    }
  });
});
