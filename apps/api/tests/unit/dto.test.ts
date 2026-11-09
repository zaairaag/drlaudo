import { describe, expect, it } from 'vitest';
import {
  toMyAppointment,
  toPublishedPatientReport,
  toStaffAppointment,
  toStaffReport,
} from '../../src/features/shared/dto.ts';

const appointmentId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const examTypeId = '44444444-4444-4444-8444-444444444444';
const instant = new Date('2026-11-10T13:00:00.000Z');

const draft = {
  id: reportId,
  appointmentId,
  title: 'Laudo válido',
  body: 'Conteúdo fictício suficientemente longo.',
  professionalName: 'Dra. Profissional',
  status: 'DRAFT' as const,
  updatedAt: instant,
  publishedAt: null,
};

const appointment = {
  id: appointmentId,
  startsAt: instant,
  status: 'SCHEDULED' as const,
  patient: { id: patientId, name: 'Paciente QA' },
  examType: { id: examTypeId, name: 'Exame QA' },
  report: null,
};

describe('DTO · validação executada antes de sair do serviço', () => {
  it('rejeita conteúdo inválido de laudo em vez de atribuir tipo por cast', () => {
    expect(() => toStaffReport({ ...draft, title: '' })).toThrow();
    expect(() => toStaffReport({ ...draft, publishedAt: instant })).toThrow();
    expect(() => toStaffReport({ ...draft, status: 'PUBLISHED', publishedAt: null })).toThrow();
  });

  it('valida relações selecionadas do agendamento', () => {
    expect(() => toStaffAppointment({ ...appointment, examType: { id: examTypeId, name: '' } }))
      .toThrow();
    expect(() => toStaffAppointment({ ...appointment, patient: { id: patientId, name: '' } }))
      .toThrow();
  });

  it('não esconde estado impossível CANCELED/PUBLISHED como report null', () => {
    expect(() => toStaffAppointment({
      ...appointment,
      status: 'CANCELED',
      report: { id: reportId, status: 'PUBLISHED' },
    })).toThrow();
  });

  it('a projeção do paciente continua ocultando rascunho e laudo de cancelado', () => {
    expect(toMyAppointment({ ...appointment, report: { status: 'DRAFT' } }).hasPublishedReport)
      .toBe(false);
    expect(toMyAppointment({ ...appointment, status: 'CANCELED', report: { status: 'PUBLISHED' } }).hasPublishedReport)
      .toBe(false);
    expect(() => toMyAppointment({ ...appointment, examType: { id: examTypeId, name: '' } }))
      .toThrow();
  });

  it('valida o conteúdo publicado selecionado para o paciente', () => {
    expect(() => toPublishedPatientReport({
      title: '',
      body: draft.body,
      professionalName: draft.professionalName,
      publishedAt: instant,
      appointment: { startsAt: instant, examType: { name: 'Exame QA' } },
    })).toThrow();
  });
});
