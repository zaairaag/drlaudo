import {
  StaffAppointmentSchema, StaffReportSchema, type StaffAppointment, type StaffReport,
} from '@drlaudo/contract';
import { expect } from 'vitest';
import { QA, auth, buildTestApp, login, type TestApp } from './setup.ts';

export const REPORT_INPUT = {
  title: 'Laudo QA de tórax',
  body: 'Conteúdo fictício com mais de dez caracteres.',
  professionalName: 'Dra. QA',
} as const;

export interface AppointmentScenario {
  app: TestApp;
  token: string;
  appointment: StaffAppointment;
}

export interface DraftScenario extends AppointmentScenario {
  report: StaffReport;
}

export async function appointmentScenario(): Promise<AppointmentScenario> {
  const app = await buildTestApp();
  const token = await login(app, 'equipe@qa.test');
  const response = await app.inject({
    method: 'POST', url: '/appointments', headers: auth(token),
    payload: { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T13:00:00.000Z' },
  });
  expect(response.statusCode).toBe(201);
  const appointment = StaffAppointmentSchema.parse(response.json());
  return { app, token, appointment };
}

export async function draftScenario(): Promise<DraftScenario> {
  const scenario = await appointmentScenario();
  const response = await scenario.app.inject({
    method: 'POST', url: `/appointments/${scenario.appointment.id}/report`,
    headers: auth(scenario.token), payload: REPORT_INPUT,
  });
  expect(response.statusCode).toBe(201);
  const report = StaffReportSchema.parse(response.json());
  return { ...scenario, report };
}
