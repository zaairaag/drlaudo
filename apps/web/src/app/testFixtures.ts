import type { LoginResponse, PublishedPatientReport, Role, StaffAppointment, StaffReport } from '@drlaudo/contract';

export function makeSession(role: Role, issuedAt = Math.floor(Date.now() / 1000)): LoginResponse {
  const user = role === 'STAFF'
    ? { id: '10000000-0000-4000-8000-000000000001', name: 'Equipe Dr. Laudo', email: 'equipe@drlaudo.test', role }
    : { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza', email: 'ana.souza@drlaudo.test', role };
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return {
    user,
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role, name: user.name, iss: 'drlaudo-api', iat: issuedAt, exp: issuedAt + 28800 })}.ZmljdGl0aW91cw`,
  };
}
export const appointment: StaffAppointment = {
  id: '30000000-0000-4000-8000-000000000003',
  startsAt: '2026-11-10T13:00:00.000Z',
  status: 'SCHEDULED',
  patient: { id: '10000000-0000-4000-8000-000000000002', name: 'SENTINELA-ANA-PRIVADA' },
  examType: { id: '20000000-0000-4000-8000-000000000003', name: 'Ressonância de crânio' },
  report: null,
};
export const report: StaffReport = {
  id: '40000000-0000-4000-8000-000000000003',
  appointmentId: appointment.id,
  title: 'Resultado fictício',
  body: 'SENTINELA-TEXTO-CLINICO somente em memória.',
  professionalName: 'Dra. Marina Costa',
  status: 'DRAFT',
  publishedAt: null,
  updatedAt: '2026-11-10T12:00:00.000Z',
};
export const patientReport: PublishedPatientReport = {
  title: 'Resultado fictício',
  body: 'Exemplo fictício de resultado publicado.',
  professionalName: 'Dra. Marina Costa',
  publishedAt: '2026-11-10T12:00:00.000Z',
  startsAt: '2026-11-10T13:00:00.000Z',
  examType: { name: 'Ressonância de crânio' },
};
