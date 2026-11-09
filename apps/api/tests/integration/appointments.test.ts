import { describe, expect, it } from 'vitest';
import { StaffAppointmentSchema, type StaffAppointment } from '@drlaudo/contract';
import { buildApp } from '../../src/app.ts';
import {
  QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase,
} from '../helpers/setup.ts';

useIsolatedDatabase();

/** Clock is 09:00 in Brasília; FUTURE is 10:00 local and PAST equals now. */
const FUTURE = '2026-11-10T13:00:00.000Z';
const PAST = '2026-11-10T12:00:00.000Z';

async function staffToken() {
  const app = await buildTestApp();
  return { app, token: await login(app, 'equipe@qa.test') };
}

it('RN-08 · criação persiste o mesmo instante capturado para a regra, mesmo com clock avançando', async () => {
  let tick = 0;
  const app = await buildApp({
    prisma: testPrisma(),
    clock: { now: () => new Date(Date.parse(QA.now) + tick++ * 60_000) },
    config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', loginRateLimitMax: 10, trustProxyHops: 0 },
  });
  try {
    const token = await login(app, 'equipe@qa.test');
    tick = 0;
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(response.statusCode).toBe(201);
    const persisted = await testPrisma().appointment.findUniqueOrThrow({
      where: { id: response.json<{ id: string }>().id },
    });
    expect(persisted.createdAt.toISOString()).toBe('2026-11-10T12:01:00.000Z');
    expect(persisted.startsAt.toISOString()).toBe(FUTURE);
  } finally {
    await app.close();
  }
});

describe('RF-03/RN-09 · cenário 1: agendamento concorrente no mesmo horário', () => {
  it('aceita exatamente uma das duas tentativas simultâneas', async () => {
    const { app, token } = await staffToken();
    const request = (patientId: string) => app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });

    const [first, second] = await Promise.all([
      request(QA.anaId),
      request(QA.brunoId),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
    const conflict = first.statusCode === 409 ? first : second;
    expect(conflict.json().error).toEqual({
      code: 'SLOT_TAKEN',
      message: 'Este horário acabou de ser ocupado.',
    });

    const persisted = await testPrisma().appointment.count({
      where: { startsAt: new Date(FUTURE), status: 'SCHEDULED' },
    });
    expect(persisted).toBe(1);
  });
});

describe('RF-03/RN-08 · cenário 5: agendamento no passado', () => {
  it.each([
    { relation: '< clock', startsAt: '2026-11-10T11:30:00.000Z' },
    { relation: '= clock', startsAt: PAST },
  ])('$relation rejeita com PAST_DATE sem INSERT e aceita controle futuro', async ({ startsAt }) => {
    const { app, token } = await staffToken();
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('PAST_DATE');
    expect(await testPrisma().appointment.count()).toBe(0);
    const control = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T12:30:00.000Z' },
    });
    expect(control.statusCode).toBe(201);
    const accepted = StaffAppointmentSchema.parse(control.json());
    expect(accepted).toEqual({
      id: accepted.id, startsAt: '2026-11-10T12:30:00.000Z', status: 'SCHEDULED', report: null,
      patient: { id: QA.anaId, name: 'Ana QA' },
      examType: { id: QA.xrayId, name: 'Raio-X de tórax' },
    });
    expect(await testPrisma().appointment.findMany()).toEqual([{
      id: accepted.id, startsAt: new Date(accepted.startsAt), patientId: QA.anaId,
      examTypeId: QA.xrayId, status: 'SCHEDULED', canceledAt: null, createdAt: new Date(QA.now),
    }]);
  });

  it('rejeita fora da grade antes de avaliar o passado', async () => {
    const { app, token } = await staffToken();
    const response = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2020-11-10T12:15:00.000Z' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_SLOT');
    expect(await testPrisma().appointment.count()).toBe(0);
  });

  it('trata paciente inexistente e usuário STAFF como o mesmo 404', async () => {
    const { app, token } = await staffToken();
    const unknown = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: {
        patientId: '99999999-9999-4999-8999-999999999999',
        examTypeId: QA.xrayId,
        startsAt: FUTURE,
      },
    });
    const staff = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.staffId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(unknown.statusCode).toBe(404);
    expect(staff.statusCode).toBe(404);
    expect(unknown.body).toBe(staff.body);
    expect(await testPrisma().appointment.count()).toBe(0);
  });
});

describe('RN-10/RN-12 · cancelamento e reutilização do horário', () => {
  it('libera o horário após cancelar e preserva o rascunho', async () => {
    const { app, token } = await staffToken();
    const created = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    const appointment = created.json<{ id: string }>();

    await app.inject({
      method: 'POST',
      url: `/appointments/${appointment.id}/report`,
      headers: auth(token),
      payload: { title: 'Laudo QA', body: 'Conteúdo fictício com mais de dez caracteres.', professionalName: 'Dra. QA' },
    });

    const appointmentBefore = await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    const draftBefore = await testPrisma().report.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    const canceled = await app.inject({
      method: 'POST',
      url: `/appointments/${appointment.id}/cancel`,
      headers: auth(token),
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().status).toBe('CANCELED');
    expect(canceled.json().report.status).toBe('DRAFT');
    expect(await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual({
      ...appointmentBefore, status: 'CANCELED', canceledAt: new Date(QA.now),
    });
    expect(await testPrisma().report.findUniqueOrThrow({ where: { id: draftBefore.id } })).toEqual(draftBefore);
    const released = await app.inject({ method: 'GET', url: '/slots?date=2026-11-10', headers: auth(token) });
    expect(released.statusCode).toBe(200);
    expect(released.json<{ slots: { startsAt: string; available: boolean }[] }>().slots
      .find((slot) => slot.startsAt === FUTURE)).toEqual({ startsAt: FUTURE, available: true });

    const reuse = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.brunoId, examTypeId: QA.ultrasoundId, startsAt: FUTURE },
    });
    expect(reuse.statusCode).toBe(201);
    expect(await testPrisma().appointment.count({ where: { startsAt: new Date(FUTURE), status: 'SCHEDULED' } })).toBe(1);
    expect(await testPrisma().appointment.count({ where: { startsAt: new Date(FUTURE), status: 'CANCELED' } })).toBe(1);
    expect(await testPrisma().report.findMany()).toEqual([draftBefore]);
  });

  it('não cancela duas vezes nem agendamento com laudo publicado', async () => {
    const { app, token } = await staffToken();
    const created = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    const appointment = created.json<{ id: string }>();
    const report = await app.inject({
      method: 'POST',
      url: `/appointments/${appointment.id}/report`,
      headers: auth(token),
      payload: { title: 'Laudo QA', body: 'Conteúdo fictício com mais de dez caracteres.', professionalName: 'Dra. QA' },
    });
    await app.inject({
      method: 'POST',
      url: `/reports/${report.json<{ id: string }>().id}/publish`,
      headers: auth(token),
    });

    const blocked = await app.inject({
      method: 'POST',
      url: `/appointments/${appointment.id}/cancel`,
      headers: auth(token),
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('CANNOT_CANCEL');
  });
});

describe('RF-04/RN-25 · consulta e grade', () => {
  it('devolve a grade completa de 24 posições com PAST antes de TAKEN', async () => {
    const { app, token } = await staffToken();
    await testPrisma().appointment.create({
      data: {
        id: '77777777-7777-4777-8777-777777777777',
        patientId: QA.anaId,
        examTypeId: QA.xrayId,
        startsAt: new Date('2026-11-10T13:30:00.000Z'),
        status: 'SCHEDULED',
        createdAt: new Date(QA.now),
      },
    });
    await testPrisma().appointment.createMany({ data: [
      {
        id: '77777777-7777-4777-8777-777777777778', patientId: QA.anaId, examTypeId: QA.xrayId,
        startsAt: new Date(PAST), status: 'SCHEDULED', createdAt: new Date(QA.now),
      },
      {
        id: '77777777-7777-4777-8777-777777777779', patientId: QA.anaId, examTypeId: QA.xrayId,
        startsAt: new Date('2026-11-10T14:00:00.000Z'), status: 'CANCELED',
        createdAt: new Date(QA.now), canceledAt: new Date(QA.now),
      },
    ] });

    const response = await app.inject({
      method: 'GET',
      url: '/slots?date=2026-11-10',
      headers: auth(token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ timezone: string; slots: { startsAt: string; available: boolean; reason?: string }[] }>();
    expect(body.timezone).toBe('America/Sao_Paulo');
    expect(body.slots).toHaveLength(24);
    expect(body.slots[0]?.startsAt).toBe('2026-11-10T10:00:00.000Z');
    expect(body.slots.at(-1)?.startsAt).toBe('2026-11-10T21:30:00.000Z');
    expect(new Set(body.slots.map((slot) => slot.startsAt)).size).toBe(24);
    for (const [index, slot] of body.slots.entries()) {
      if (index > 0) {
        const previous = body.slots[index - 1];
        expect(new Date(slot.startsAt).getTime() - new Date(previous?.startsAt ?? '').getTime()).toBe(30 * 60_000);
      }
    }
    expect(body.slots.find((slot) => slot.startsAt === PAST)?.reason).toBe('PAST');
    expect(body.slots.find((slot) => slot.startsAt === '2026-11-10T13:30:00.000Z')?.reason).toBe('TAKEN');
    expect(body.slots.find((slot) => slot.startsAt === '2026-11-10T14:00:00.000Z')?.available).toBe(true);
    expect(body.slots.find((slot) => slot.startsAt === '2026-11-10T14:00:00.000Z')).toEqual({
      startsAt: '2026-11-10T14:00:00.000Z', available: true,
    });
  });

  it('filtra por data e paciente e ordena por início', async () => {
    const { app, token } = await staffToken();
    const db = testPrisma();
    await db.appointment.createMany({
      data: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          patientId: QA.anaId,
          examTypeId: QA.xrayId,
          startsAt: new Date('2026-11-10T13:00:00.000Z'),
          status: 'SCHEDULED',
          createdAt: new Date(QA.now),
        },
        {
          id: '99999999-9999-4999-8999-999999999991',
          patientId: QA.brunoId,
          examTypeId: QA.xrayId,
          startsAt: new Date('2026-11-10T13:30:00.000Z'),
          status: 'SCHEDULED',
          createdAt: new Date(QA.now),
        },
      ],
    });

    const all = await app.inject({
      method: 'GET',
      url: '/appointments?date=2026-11-10',
      headers: auth(token),
    });
    expect(all.json<unknown[]>()).toHaveLength(2);

    const filtered = await app.inject({
      method: 'GET',
      url: `/appointments?date=2026-11-10&patientId=${QA.anaId}`,
      headers: auth(token),
    });
    expect(filtered.json<{ patient: { id: string } }[]>()).toHaveLength(1);
    expect(filtered.json<{ patient: { id: string } }[]>()[0]?.patient.id).toBe(QA.anaId);
  });
});

describe('Atomicidade da mutação e validação do DTO', () => {
  it('não confirma criação quando o catálogo persistido torna a saída inválida', async () => {
    const { app, token } = await staffToken();
    await testPrisma().examType.update({ where: { id: QA.xrayId }, data: { name: '' } });
    const before = await testPrisma().appointment.findMany({ orderBy: { id: 'asc' } });
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' },
    });
    expect(await testPrisma().appointment.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('não confirma cancelamento quando a saída é inválida', async () => {
    const { app, token } = await staffToken();
    const created = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    await testPrisma().examType.update({ where: { id: QA.xrayId }, data: { name: '' } });
    const before = await testPrisma().appointment.findUniqueOrThrow({ where: { id } });
    const response = await app.inject({
      method: 'POST', url: `/appointments/${id}/cancel`, headers: auth(token),
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(await testPrisma().appointment.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
});

describe('Agendamentos · negativas, leitura e filtros nas fronteiras civis', () => {
  it.each([
    '2026-11-10T09:30:00.000Z',
    '2026-11-10T22:00:00.000Z',
    '2026-11-10T13:15:00.000Z',
    '2026-11-10T13:00:01.000Z',
    '2026-11-10T13:00:00.001Z',
  ])('%s viola a grade e não insere nada', async (startsAt) => {
    const { app, token } = await staffToken();
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_SLOT');
    expect(await testPrisma().appointment.count()).toBe(0);
  });

  it('exame inexistente retorna 404 sem escrita e sem diferenciar paciente inexistente', async () => {
    const { app, token } = await staffToken();
    const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const exam = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: missing, startsAt: FUTURE },
    });
    const patient = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: missing, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(exam.statusCode).toBe(404);
    expect(patient.statusCode).toBe(404);
    expect(exam.body).toBe(patient.body);
    expect(await testPrisma().appointment.count()).toBe(0);
  });

  it('cancelamento repetido ou inexistente não muda data nem campos persistidos', async () => {
    const { app, token } = await staffToken();
    const created = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    const first = await app.inject({ method: 'POST', url: `/appointments/${id}/cancel`, headers: auth(token) });
    expect(first.statusCode).toBe(200);
    const before = await testPrisma().appointment.findUniqueOrThrow({ where: { id } });
    const later = await buildTestApp('2026-11-10T12:30:00.000Z');
    const laterToken = await login(later, 'equipe@qa.test');
    const repeat = await later.inject({ method: 'POST', url: `/appointments/${id}/cancel`, headers: auth(laterToken) });
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json().error.code).toBe('CANNOT_CANCEL');
    const missing = await app.inject({
      method: 'POST', url: '/appointments/ffffffff-ffff-4fff-8fff-ffffffffffff/cancel', headers: auth(token),
    });
    expect(missing.statusCode).toBe(404);
    expect(await testPrisma().appointment.findMany()).toEqual([before]);
  });

  it('date usa início local inclusivo e próximo dia exclusivo; empate usa id e filtro combina paciente', async () => {
    const { app, token } = await staffToken();
    const ids = {
      before: '88000000-0000-4000-8000-000000000001',
      from: '88000000-0000-4000-8000-000000000002',
      tieA: '88000000-0000-4000-8000-000000000003',
      tieB: '88000000-0000-4000-8000-000000000004',
      last: '88000000-0000-4000-8000-000000000005',
      to: '88000000-0000-4000-8000-000000000006',
    };
    const base = { patientId: QA.anaId, examTypeId: QA.xrayId, createdAt: new Date(QA.now) };
    await testPrisma().appointment.createMany({ data: [
      { ...base, id: ids.to, startsAt: new Date('2026-11-11T03:00:00.000Z') },
      { ...base, id: ids.tieB, startsAt: new Date(FUTURE), status: 'CANCELED', canceledAt: new Date(QA.now) },
      { ...base, id: ids.last, patientId: QA.brunoId, startsAt: new Date('2026-11-11T02:59:59.999Z') },
      { ...base, id: ids.before, startsAt: new Date('2026-11-10T02:59:59.999Z') },
      { ...base, id: ids.tieA, startsAt: new Date(FUTURE), status: 'CANCELED', canceledAt: new Date(QA.now) },
      { ...base, id: ids.from, startsAt: new Date('2026-11-10T03:00:00.000Z') },
    ] });
    const all = await app.inject({ method: 'GET', url: '/appointments?date=2026-11-10', headers: auth(token) });
    expect(all.statusCode).toBe(200);
    expect(all.json<StaffAppointment[]>().map((item) => item.id)).toEqual([ids.from, ids.tieA, ids.tieB, ids.last]);
    expect(all.json<StaffAppointment[]>().map((item) => item.status)).toEqual(['SCHEDULED', 'CANCELED', 'CANCELED', 'SCHEDULED']);
    const own = await app.inject({
      method: 'GET', url: `/appointments?date=2026-11-10&patientId=${QA.anaId}`, headers: auth(token),
    });
    expect(own.statusCode).toBe(200);
    expect(own.json<StaffAppointment[]>().map((item) => item.id)).toEqual([ids.from, ids.tieA, ids.tieB]);
    const empty = await app.inject({
      method: 'GET', url: '/appointments?date=2026-11-10&patientId=ffffffff-ffff-4fff-8fff-ffffffffffff', headers: auth(token),
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
  });

  it('janela padrão é hoje local até +30 dias exclusivo, inclusive ao filtrar só paciente', async () => {
    const { app, token } = await staffToken();
    const boundaryRows = [
      { id: '89000000-0000-4000-8000-000000000001', startsAt: '2026-11-10T02:59:59.999Z' },
      { id: '89000000-0000-4000-8000-000000000002', startsAt: '2026-11-10T03:00:00.000Z' },
      { id: '89000000-0000-4000-8000-000000000003', startsAt: '2026-12-10T02:59:59.999Z' },
      { id: '89000000-0000-4000-8000-000000000004', startsAt: '2026-12-10T03:00:00.000Z' },
    ] as const;
    await testPrisma().appointment.createMany({ data: boundaryRows.map(({ id, startsAt }) => ({
      id, patientId: QA.anaId, examTypeId: QA.xrayId,
      startsAt: new Date(startsAt), createdAt: new Date(QA.now),
    })) });
    for (const url of ['/appointments', `/appointments?patientId=${QA.anaId}`]) {
      const response = await app.inject({ method: 'GET', url, headers: auth(token) });
      expect(response.statusCode).toBe(200);
      expect(response.json<StaffAppointment[]>().map((item) => item.id)).toEqual([
        boundaryRows[1].id, boundaryRows[2].id,
      ]);
    }
  });
});

describe('Criação · campos fechados e bordas válidas da grade', () => {
  it.each(['id', 'status', 'createdAt', 'canceledAt', 'report', 'duration'])('%s não pode ser definido pelo cliente', async (field) => {
    const { app, token } = await staffToken();
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: {
        patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: FUTURE, [field]: 'valor indevido',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: [field], rule: 'UNKNOWN_FIELD' }),
    ]);
    expect(await testPrisma().appointment.count()).toBe(0);
  });

  it.each([
    '2026-11-10T13:00:00Z',
    '2026-11-10T10:00:00.000-03:00',
    '2026-02-30T13:00:00.000Z',
    '2026-11-10T24:00:00.000Z',
    '2026-11-10',
  ])('%s falha no formato antes da regra de grade ou passado', async (startsAt) => {
    const { app, token } = await staffToken();
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', path: ['startsAt'], rule: 'INVALID_FORMAT' }),
    ]);
    expect(await testPrisma().appointment.count()).toBe(0);
  });

  it.each(['2026-11-10T10:00:00.000Z', '2026-11-10T21:30:00.000Z'])('%s aceita primeiro/último horário e retorna somente DTO após persistência', async (startsAt) => {
    const app = await buildTestApp('2026-11-09T12:00:00.000Z');
    const token = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token),
      payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt },
    });
    expect(response.statusCode).toBe(201);
    const appointment = StaffAppointmentSchema.parse(response.json());
    expect(appointment).toEqual({
      id: appointment.id, startsAt, status: 'SCHEDULED', report: null,
      patient: { id: QA.anaId, name: 'Ana QA' }, examType: { id: QA.xrayId, name: 'Raio-X de tórax' },
    });
    expect(await testPrisma().appointment.findMany()).toEqual([{
      id: appointment.id, patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: new Date(startsAt),
      status: 'SCHEDULED', canceledAt: null, createdAt: new Date('2026-11-09T12:00:00.000Z'),
    }]);
    const detail = await app.inject({ method: 'GET', url: `/appointments/${appointment.id}`, headers: auth(token) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(appointment);
    expect(response.body).not.toContain('password');
  });
});
