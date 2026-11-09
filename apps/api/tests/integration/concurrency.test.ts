import { describe, expect, it } from 'vitest';
import type { Appointment, Report } from '../../src/generated/prisma/client.ts';
import { withAppointmentLock } from '../helpers/appointment-lock.ts';
import {
  REPORT_INPUT, appointmentScenario, draftScenario, type AppointmentScenario,
} from '../helpers/report-scenario.ts';
import { QA, auth, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();


async function snapshot(appointmentId: string): Promise<Snapshot> {
  return {
    appointment: await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointmentId } }),
    report: await testPrisma().report.findUnique({ where: { appointmentId } }),
  };
}

interface Snapshot {
  appointment: Appointment;
  report: Report | null;
}

async function expectCommitted(scenario: AppointmentScenario, expected: Snapshot): Promise<void> {
  expect(await snapshot(scenario.appointment.id)).toEqual(expected);
  const { app, token, appointment } = scenario;
  const detail = await app.inject({ method: 'GET', url: `/appointments/${appointment.id}`, headers: auth(token) });
  expect(detail.statusCode).toBe(200);
  expect(detail.json()).toEqual({
    ...appointment, status: expected.appointment.status,
    report: expected.report ? { id: expected.report.id, status: expected.report.status } : null,
  });
  const staffReport = await app.inject({ method: 'GET', url: `/appointments/${appointment.id}/report`, headers: auth(token) });
  expect(staffReport.statusCode).toBe(expected.report ? 200 : 404);
  if (expected.report) {
    const { id, appointmentId, title, body, professionalName, status, updatedAt, publishedAt } = expected.report;
    expect(staffReport.json()).toEqual({
      id, appointmentId, title, body, professionalName, status,
      updatedAt: updatedAt.toISOString(), publishedAt: publishedAt?.toISOString() ?? null,
    });
  }
  const ana = await login(app, 'ana@qa.test');
  const ownList = await app.inject({ method: 'GET', url: '/me/appointments', headers: auth(ana) });
  expect(ownList.statusCode).toBe(200);
  const isPublished = expected.appointment.status === 'SCHEDULED' && expected.report?.status === 'PUBLISHED';
  expect(ownList.json()).toEqual([{
    id: appointment.id, startsAt: appointment.startsAt, status: expected.appointment.status,
    examType: appointment.examType, hasPublishedReport: isPublished,
  }]);
  const ownReport = await app.inject({ method: 'GET', url: `/me/appointments/${appointment.id}/report`, headers: auth(ana) });
  expect(ownReport.statusCode).toBe(isPublished ? 200 : 404);
  if (isPublished && expected.report) {
    expect(ownReport.json()).toEqual({
      title: expected.report.title, body: expected.report.body,
      professionalName: expected.report.professionalName,
      startsAt: appointment.startsAt, examType: { name: appointment.examType.name },
      publishedAt: expected.report.publishedAt?.toISOString(),
    });
  }
}

/** Both HTTP transactions are observed in the real PostgreSQL lock queue. */
async function queuedPair<T>(
  appointmentId: string,
  first: () => PromiseLike<T>,
  second: () => PromiseLike<T>,
): Promise<[T, T]> {
  let responses: [T, T] | undefined;
  await withAppointmentLock(appointmentId, async (lock) => {
    const one = lock.start(first);
    const firstWaiters = await lock.waitForWaiters(1);
    expect(firstWaiters).toHaveLength(1);
    const firstPid = firstWaiters[0]?.pid;
    expect(firstPid).toBeDefined();
    const two = lock.start(second);
    const waiters = await lock.waitForWaiters(2);
    expect(waiters).toHaveLength(2);
    expect(new Set(waiters.map((waiter) => waiter.pid)).size).toBe(2);
    for (const waiter of waiters) {
      expect(waiter.pid).not.toBe(lock.blockerPid);
      expect(waiter.observerPid).not.toBe(waiter.pid);
      expect(waiter.observerPid).not.toBe(lock.blockerPid);
      expect(waiter.query).toMatch(/FOR UPDATE/i);
      expect(waiter.blockers.length).toBeGreaterThan(0);
    }
    expect(waiters.some((waiter) => waiter.pid === firstPid)).toBe(true);
    await lock.release();
    responses = await Promise.all([one, two]);
  });
  if (responses === undefined) throw new Error('Corrida terminou sem respostas HTTP.');
  return responses;
}

const rounds = Array.from({ length: 20 }, (_, index) => ({
  round: index + 1,
  first: index % 2 === 0 ? 'cancel' as const : 'publish' as const,
}));

describe('RACE-01 · cancelar × publicar', () => {
  it.each(rounds)('rodada $round, $first primeiro: estado completo após ambos os commits', async ({ first }) => {
    const scenario = await draftScenario();
    const { app, token, appointment, report } = scenario;
    const before = await snapshot(appointment.id);
    if (!before.report) throw new Error('Fixture sem rascunho persistido.');
    const cancel = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/cancel`, headers: auth(token) });
    const publish = () => app.inject({ method: 'POST', url: `/reports/${report.id}/publish`, headers: auth(token) });
    const results = await queuedPair(appointment.id, first === 'cancel' ? cancel : publish, first === 'cancel' ? publish : cancel);
    const [cancelResult, publishResult] = first === 'cancel' ? results : [results[1], results[0]];
    expect(cancelResult.statusCode).toBe(first === 'cancel' ? 200 : 409);
    expect(publishResult.statusCode).toBe(first === 'publish' ? 200 : 409);
    if (first === 'cancel') {
      expect(publishResult.json().error.code).toBe('APPOINTMENT_CANCELED');
      expect(cancelResult.json()).toEqual({ ...appointment, status: 'CANCELED', report: { id: report.id, status: 'DRAFT' } });
      await expectCommitted(scenario, {
        appointment: { ...before.appointment, status: 'CANCELED', canceledAt: new Date(QA.now) },
        report: before.report,
      });
    } else {
      expect(cancelResult.json().error.code).toBe('CANNOT_CANCEL');
      expect(publishResult.json()).toEqual({ ...report, status: 'PUBLISHED', publishedAt: QA.now, updatedAt: QA.now });
      await expectCommitted(scenario, {
        appointment: before.appointment,
        report: { ...before.report, status: 'PUBLISHED', publishedAt: new Date(QA.now), updatedAt: new Date(QA.now) },
      });
    }
  });

  it.each(['cancel', 'publish'] as const)('controle sequencial: %s conclui antes da segunda operação', async (first) => {
    const scenario = await draftScenario();
    const { app, token, appointment, report } = scenario;
    const before = await snapshot(appointment.id);
    if (!before.report) throw new Error('Fixture sem rascunho persistido.');
    const cancel = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/cancel`, headers: auth(token) });
    const publish = () => app.inject({ method: 'POST', url: `/reports/${report.id}/publish`, headers: auth(token) });
    const success = await (first === 'cancel' ? cancel() : publish());
    expect(success.statusCode).toBe(200);
    const conflict = await (first === 'cancel' ? publish() : cancel());
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe(first === 'cancel' ? 'APPOINTMENT_CANCELED' : 'CANNOT_CANCEL');
    await expectCommitted(scenario, first === 'cancel' ? {
      appointment: { ...before.appointment, status: 'CANCELED', canceledAt: new Date(QA.now) }, report: before.report,
    } : {
      appointment: before.appointment,
      report: { ...before.report, status: 'PUBLISHED', publishedAt: new Date(QA.now), updatedAt: new Date(QA.now) },
    });
  });
});

describe('RACE-02 · duas criações de laudo no mesmo agendamento', () => {
  it.each(['A', 'B'] as const)('pedido %s entra primeiro: um 201, um REPORT_EXISTS e uma linha completa', async (first) => {
    const scenario = await appointmentScenario();
    const { app, token, appointment } = scenario;
    const before = await snapshot(appointment.id);
    const payloadA = { ...REPORT_INPUT, title: 'Título do pedido A', body: 'Conteúdo exclusivo e fictício do pedido A.' };
    const payloadB = { ...REPORT_INPUT, title: 'Título do pedido B', body: 'Conteúdo exclusivo e fictício do pedido B.' };
    const createA = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/report`, headers: auth(token), payload: payloadA });
    const createB = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/report`, headers: auth(token), payload: payloadB });
    const [winner, loser] = await queuedPair(appointment.id, first === 'A' ? createA : createB, first === 'A' ? createB : createA);
    expect(winner.statusCode).toBe(201);
    expect(loser.statusCode).toBe(409);
    expect(loser.json().error.code).toBe('REPORT_EXISTS');
    const id = winner.json<{ id: string }>().id;
    expect(await testPrisma().report.count({ where: { appointmentId: appointment.id } })).toBe(1);
    await expectCommitted(scenario, {
      appointment: before.appointment,
      report: {
        id, appointmentId: appointment.id, ...(first === 'A' ? payloadA : payloadB), status: 'DRAFT',
        createdAt: new Date(QA.now), updatedAt: new Date(QA.now), publishedAt: null,
      },
    });
  });
});

describe('RACE-03 · editar × publicar', () => {
  it.each(['edit', 'publish'] as const)('%s primeiro: conteúdo publicado fica definitivamente congelado', async (first) => {
    const scenario = await draftScenario();
    const { app, token, appointment, report } = scenario;
    const before = await snapshot(appointment.id);
    if (!before.report) throw new Error('Fixture sem rascunho persistido.');
    const revised = { title: 'Título revisado concorrente', body: 'Corpo revisado completo antes da publicação.', professionalName: 'Dra. Revisora QA' };
    const edit = () => app.inject({ method: 'PATCH', url: `/reports/${report.id}`, headers: auth(token), payload: revised });
    const publish = () => app.inject({ method: 'POST', url: `/reports/${report.id}/publish`, headers: auth(token) });
    const results = await queuedPair(appointment.id, first === 'edit' ? edit : publish, first === 'edit' ? publish : edit);
    const [editResult, publishResult] = first === 'edit' ? results : [results[1], results[0]];
    expect(publishResult.statusCode).toBe(200);
    expect(editResult.statusCode).toBe(first === 'edit' ? 200 : 409);
    if (first === 'publish') expect(editResult.json().error.code).toBe('REPORT_LOCKED');
    const expected = {
      appointment: before.appointment,
      report: { ...before.report, ...(first === 'edit' ? revised : {}), status: 'PUBLISHED' as const, publishedAt: new Date(QA.now), updatedAt: new Date(QA.now) },
    };
    await expectCommitted(scenario, expected);
    const rejected = await edit();
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('REPORT_LOCKED');
    await expectCommitted(scenario, expected);
  });
});

describe('RACE-04 · criar laudo × cancelar agendamento', () => {
  it.each(['create', 'cancel'] as const)('%s primeiro: cancelamento preserva somente laudo já criado', async (first) => {
    const scenario = await appointmentScenario();
    const { app, token, appointment } = scenario;
    const before = await snapshot(appointment.id);
    const create = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/report`, headers: auth(token), payload: REPORT_INPUT });
    const cancel = () => app.inject({ method: 'POST', url: `/appointments/${appointment.id}/cancel`, headers: auth(token) });
    const results = await queuedPair(appointment.id, first === 'create' ? create : cancel, first === 'create' ? cancel : create);
    const [createResult, cancelResult] = first === 'create' ? results : [results[1], results[0]];
    expect(cancelResult.statusCode).toBe(200);
    expect(createResult.statusCode).toBe(first === 'create' ? 201 : 409);
    if (first === 'cancel') expect(createResult.json().error.code).toBe('APPOINTMENT_CANCELED');
    await expectCommitted(scenario, {
      appointment: { ...before.appointment, status: 'CANCELED', canceledAt: new Date(QA.now) },
      report: first === 'create' ? {
        id: createResult.json<{ id: string }>().id, appointmentId: appointment.id, ...REPORT_INPUT,
        status: 'DRAFT', createdAt: new Date(QA.now), updatedAt: new Date(QA.now), publishedAt: null,
      } : null,
    });
    expect(await testPrisma().report.count({ where: { appointmentId: appointment.id } })).toBe(first === 'create' ? 1 : 0);
  });
});
