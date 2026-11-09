import { describe, expect, it } from 'vitest';
import { StaffAppointmentSchema, StaffReportSchema } from '@drlaudo/contract';
import { buildApp } from '../../src/app.ts';
import type { Clock } from '../../src/clock.ts';
import { withAppointmentLock } from '../helpers/appointment-lock.ts';
import { REPORT_INPUT, appointmentScenario, draftScenario } from '../helpers/report-scenario.ts';
import { QA, auth, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

const mutations = ['cancel', 'create-report', 'edit-report', 'publish-report'] as const;

describe('Locks reais · cada mutação espera SELECT Appointment FOR UPDATE', () => {
  it.each(mutations)('%s usa conexão independente e espera até o bloqueio ser liberado', async (mutation) => {
    const scenario = mutation === 'create-report'
      ? { ...await appointmentScenario(), report: null }
      : await draftScenario();
    const { app, token, appointment } = scenario;
    const appointmentBefore = await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    const reportBefore = await testPrisma().report.findUnique({ where: { appointmentId: appointment.id } });
    const reportId = scenario.report?.id;
    if (mutation !== 'create-report' && reportId === undefined) throw new Error('Fixture sem rascunho.');

    await withAppointmentLock(appointment.id, async (lock) => {
      const pending = lock.start(() => {
        switch (mutation) {
          case 'cancel':
            return app.inject({ method: 'POST', url: `/appointments/${appointment.id}/cancel`, headers: auth(token) });
          case 'create-report':
            return app.inject({ method: 'POST', url: `/appointments/${appointment.id}/report`, headers: auth(token), payload: REPORT_INPUT });
          case 'edit-report':
            return app.inject({ method: 'PATCH', url: `/reports/${reportId}`, headers: auth(token), payload: { title: 'Título revisado sob bloqueio' } });
          case 'publish-report':
            return app.inject({ method: 'POST', url: `/reports/${reportId}/publish`, headers: auth(token) });
        }
      });
      const waiting = await lock.waitForWaiters(1);
      expect(waiting).toHaveLength(1);
      const waiter = waiting[0];
      expect(waiter).toBeDefined();
      if (!waiter) throw new Error('Mutação não apareceu em pg_stat_activity.');
      expect(waiter.pid).not.toBe(lock.blockerPid);
      expect(waiter.observerPid).not.toBe(lock.blockerPid);
      expect(waiter.observerPid).not.toBe(waiter.pid);
      expect(waiter.blockers).toContain(lock.blockerPid);
      expect(waiter.locktype).toBe('transactionid');
      expect(waiter.mode).toBe('ShareLock');
      expect(waiter.query).toMatch(/FOR UPDATE/i);
      expect(await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual(appointmentBefore);
      expect(await testPrisma().report.findUnique({ where: { appointmentId: appointment.id } })).toEqual(reportBefore);

      await lock.release();
      const response = await pending;
      expect(response.statusCode).toBe(mutation === 'create-report' ? 201 : 200);
      const appointmentAfter = await testPrisma().appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      const reportAfter = await testPrisma().report.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      expect(appointmentAfter).toEqual(mutation === 'cancel'
        ? { ...appointmentBefore, status: 'CANCELED', canceledAt: new Date(QA.now) }
        : appointmentBefore);
      if (mutation === 'create-report') {
        expect(reportAfter).toEqual({
          id: response.json<{ id: string }>().id, appointmentId: appointment.id, ...REPORT_INPUT,
          status: 'DRAFT', createdAt: new Date(QA.now), updatedAt: new Date(QA.now), publishedAt: null,
        });
      } else {
        expect(reportAfter).toEqual({
          ...reportBefore,
          ...(mutation === 'edit-report' ? { title: 'Título revisado sob bloqueio', updatedAt: new Date(QA.now) } : {}),
          ...(mutation === 'publish-report' ? { status: 'PUBLISHED', publishedAt: new Date(QA.now), updatedAt: new Date(QA.now) } : {}),
        });
      }
    });
  });
});

describe('Clock após o lock · timestamps refletem a entrada na seção crítica', () => {
  it.each(mutations)('%s captura o clock avançado durante a espera real por FOR UPDATE', async (mutation) => {
    let instant: string = QA.now;
    const clock: Clock = { now: () => new Date(instant) };
    const later = '2026-11-10T12:30:00.000Z';
    const revisedTitle = 'Título alterado depois da espera';
    const db = testPrisma();
    const app = await buildApp({
      prisma: db, clock,
      config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', loginRateLimitMax: 10, trustProxyHops: 0 },
    });
    try {
      const token = await login(app, 'equipe@qa.test');
      const created = await app.inject({
        method: 'POST', url: '/appointments', headers: auth(token),
        payload: {
          patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z',
        },
      });
      expect(created.statusCode).toBe(201);
      const appointment = StaffAppointmentSchema.parse(created.json());
      if (mutation !== 'create-report') {
        const draft = await app.inject({
          method: 'POST', url: `/appointments/${appointment.id}/report`,
          headers: auth(token), payload: REPORT_INPUT,
        });
        expect(draft.statusCode).toBe(201);
        expect(StaffReportSchema.parse(draft.json())).toMatchObject({
          status: 'DRAFT', updatedAt: QA.now, publishedAt: null,
        });
      }
      const appointmentBefore = await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      const reportBefore = await db.report.findUnique({ where: { appointmentId: appointment.id } });
      if (mutation !== 'create-report' && !reportBefore) throw new Error('Fixture sem rascunho persistido.');

      await withAppointmentLock(appointment.id, async (lock) => {
        const pending = lock.start(() => {
          switch (mutation) {
            case 'cancel':
              return app.inject({ method: 'POST', url: `/appointments/${appointment.id}/cancel`, headers: auth(token) });
            case 'create-report':
              return app.inject({ method: 'POST', url: `/appointments/${appointment.id}/report`, headers: auth(token), payload: REPORT_INPUT });
            case 'edit-report':
              return app.inject({ method: 'PATCH', url: `/reports/${reportBefore?.id}`, headers: auth(token), payload: { title: revisedTitle } });
            case 'publish-report':
              return app.inject({ method: 'POST', url: `/reports/${reportBefore?.id}/publish`, headers: auth(token) });
          }
        });
        const waiting = await lock.waitForWaiters(1);
        expect(waiting).toHaveLength(1);
        expect(waiting[0]?.blockers).toContain(lock.blockerPid);
        expect(waiting[0]?.pid).not.toBe(lock.blockerPid);
        expect(await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual(appointmentBefore);
        expect(await db.report.findUnique({ where: { appointmentId: appointment.id } })).toEqual(reportBefore);

        instant = later;
        await lock.release();
        const response = await pending;
        expect(response.statusCode).toBe(mutation === 'create-report' ? 201 : 200);
        expect(await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual(
          mutation === 'cancel'
            ? { ...appointmentBefore, status: 'CANCELED', canceledAt: new Date(later) }
            : appointmentBefore,
        );
        const reportAfter = await db.report.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
        if (mutation === 'cancel') {
          expect(reportAfter).toEqual(reportBefore);
          expect(StaffAppointmentSchema.parse(response.json())).toEqual({
            ...appointment, status: 'CANCELED', report: { id: reportAfter.id, status: 'DRAFT' },
          });
          return;
        }
        if (mutation === 'create-report') {
          expect(reportAfter).toEqual({
            id: reportAfter.id, appointmentId: appointment.id, ...REPORT_INPUT,
            status: 'DRAFT', createdAt: new Date(later), updatedAt: new Date(later), publishedAt: null,
          });
        } else {
          if (!reportBefore) throw new Error('Fixture sem rascunho persistido.');
          expect(reportAfter).toEqual({
            ...reportBefore, updatedAt: new Date(later),
            ...(mutation === 'edit-report' ? { title: revisedTitle } : {}),
            ...(mutation === 'publish-report' ? { status: 'PUBLISHED', publishedAt: new Date(later) } : {}),
          });
          expect(reportAfter.createdAt).toEqual(new Date(QA.now));
        }
        expect(reportAfter.updatedAt).not.toEqual(new Date(QA.now));
        expect(StaffReportSchema.parse(response.json())).toEqual({
          id: reportAfter.id, appointmentId: appointment.id, title: reportAfter.title,
          body: reportAfter.body, professionalName: reportAfter.professionalName,
          status: reportAfter.status, updatedAt: later,
          publishedAt: mutation === 'publish-report' ? later : null,
        });
      });
    } finally {
      await app.close();
    }
  });
});
