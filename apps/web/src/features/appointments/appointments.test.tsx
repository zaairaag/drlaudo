import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { generateDaySlots } from '@drlaudo/contract';
import { api } from '../../app/api';
import { createAppStore, type AppStore } from '../../app/store';
import { setSession } from '../../app/authSlice';
import { appointment, makeSession } from '../../app/testFixtures';
import { SlotGrid } from '../../components/product/SlotGrid';
import { NewAppointmentPage } from './NewAppointmentPage';

const resources: { store: AppStore; router: { dispose: () => void } }[] = [];
afterEach(() => {
  cleanup();
  for (const { store, router } of resources.splice(0)) {
    router.dispose();
    store.dispose();
  }
  vi.restoreAllMocks();
});

describe('S3.9 S3.10 S3.12: escolha explícita de horário', () => {
  const slots = [
    { startsAt: '2026-11-10T13:00:00.000Z', available: true as const },
    { startsAt: '2026-11-10T13:30:00.000Z', available: false as const, reason: 'TAKEN' as const },
    { startsAt: '2026-11-10T10:00:00.000Z', available: false as const, reason: 'PAST' as const },
  ];
  it('seleciona somente horário livre e apresenta nomes acessíveis de Brasília', async () => {
    const chosen: string[] = [];
    render(<SlotGrid slots={slots} onChange={(value) => chosen.push(value)} />);
    await userEvent.click(screen.getByRole('button', { name: '10:00, disponível' }));
    expect(chosen).toEqual(['2026-11-10T13:00:00.000Z']);
    expect(screen.getByRole('button', { name: '10:30, ocupado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '07:00, horário passado' })).toBeDisabled();
  });
  it('não permite escolher slot quando a grade está desabilitada', async () => {
    const chosen: string[] = [];
    render(<SlotGrid slots={slots} disabled onChange={(value) => chosen.push(value)} />);
    await userEvent.click(screen.getByRole('button', { name: '10:00, disponível' }));
    expect(chosen).toEqual([]);
  });
});

function openNewAppointment(search: string, creationResponse?: Promise<Response>) {
  const store = createAppStore();
  store.dispatch(setSession(makeSession('STAFF')));
  const router = createMemoryRouter([
    { path: '/agendamentos/novo', element: <NewAppointmentPage /> },
    { path: '/agenda', element: <h1>Agenda de exames</h1> },
  ], { initialEntries: [`/agendamentos/novo${search}`] });
  resources.push({ store, router });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const request = new URL(String(url), 'http://localhost');
    if (request.pathname === '/api/patients') return Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test' }]);
    if (request.pathname === '/api/exam-types') return Response.json([{ ...appointment.examType, code: 'MRI' }]);
    if (request.pathname === '/api/slots') {
      const date = request.searchParams.get('date') ?? '2026-11-10';
      return Response.json({ date, timezone: 'America/Sao_Paulo', slots: generateDaySlots(date).map((startsAt) => ({ startsAt, available: true })) });
    }
    if (request.pathname === '/api/appointments' && init?.method === 'POST') return creationResponse ?? Response.json(appointment, { status: 201 });
    throw new Error(`Requisição inesperada: ${request.pathname}`);
  });
  render(<Provider store={store}><RouterProvider router={router} /></Provider>);
  return { router, store, fetch, user: userEvent.setup() };
}

describe('Continuidade do novo agendamento', () => {
  it('mantém contexto no retorno e ao mudar data, sem pré-selecionar paciente ou exame', async () => {
    const { router, user } = openNewAppointment(`?date=2026-11-10&patientId=${appointment.patient.id}`);
    await screen.findByRole('button', { name: '10:00, disponível' });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Exame' })).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Voltar para agenda' })).toHaveAttribute('href', `/agenda?date=2026-11-10&patientId=${appointment.patient.id}`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), appointment.patient.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Exame' }), appointment.examType.id);
    await user.click(screen.getByRole('button', { name: '10:00, disponível' }));
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-11' } });
    await screen.findByRole('button', { name: '10:00, disponível' });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    expect(screen.getByRole('combobox', { name: 'Exame' })).toHaveValue(appointment.examType.id);
    expect(screen.getByRole('button', { name: '10:00, disponível' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('link', { name: 'Voltar para agenda' }));
    expect(router.state.location.search).toBe(`?date=2026-11-11&patientId=${appointment.patient.id}`);
  });

  it('só depois do POST confirmado informa o id criado e retorna sem filtro que o ocultaria', async () => {
    const creation = Promise.withResolvers<Response>();
    const { router, user } = openNewAppointment('?date=2026-11-10&patientId=10000000-0000-4000-8000-000000000099', creation.promise);
    await screen.findByRole('button', { name: '10:00, disponível' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), appointment.patient.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Exame' }), appointment.examType.id);
    await user.click(screen.getByRole('button', { name: '10:00, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Agendar exame' }));
    await screen.findByRole('button', { name: 'Agendando…' });
    expect(router.state.location.pathname).toBe('/agendamentos/novo');
    expect(router.state.location.state).toBeNull();
    creation.resolve(Response.json(appointment, { status: 201 }));
    await screen.findByRole('heading', { name: 'Agenda de exames' });
    const query = new URLSearchParams(router.state.location.search);
    expect(query.get('date')).toBe('2026-11-10');
    expect(query.get('focus')).toBe(appointment.id);
    expect(query.has('patientId')).toBe(false);
    expect(router.state.location.state).toEqual({ createdAppointmentId: appointment.id });
  });

  it('reconcilia criação incerta com agenda fresca, detalhe e slots antes de concluir sem outro POST', async () => {
    const { router, store, fetch, user } = openNewAppointment('?date=2026-11-10');
    await screen.findByRole('button', { name: '10:00, disponível' });
    const original = fetch.getMockImplementation()!;
    let applied = false;
    let writes = 0;
    const reads: string[] = [];
    const slots = Promise.withResolvers<Response>();
    fetch.mockImplementation(async (url, init) => {
      const request = new URL(String(url), 'http://localhost');
      if (request.pathname === '/api/appointments' && init?.method === 'POST') {
        applied = true;
        writes += 1;
        throw new TypeError('Resposta perdida depois do commit');
      }
      if (request.pathname === '/api/appointments') {
        reads.push(request.pathname);
        return Response.json(applied ? [appointment] : []);
      }
      if (request.pathname === `/api/appointments/${appointment.id}`) {
        reads.push(request.pathname);
        return Response.json(appointment);
      }
      if (applied && request.pathname === '/api/slots') {
        reads.push(request.pathname);
        return (await slots.promise).clone();
      }
      return original(url, init);
    });
    await act(async () => { await store.dispatch(api.endpoints.getAppointments.initiate({ date: '2026-11-10' }, { subscribe: false })).unwrap(); });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), appointment.patient.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Exame' }), appointment.examType.id);
    await user.click(screen.getByRole('button', { name: '10:00, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Agendar exame' }));
    await waitFor(() => expect(reads).toContain('/api/slots'));
    expect(screen.getByRole('button', { name: 'Agendando…' })).toBeDisabled();
    expect(router.state.location.pathname).toBe('/agendamentos/novo');
    slots.resolve(Response.json({
      date: '2026-11-10', timezone: 'America/Sao_Paulo',
      slots: generateDaySlots('2026-11-10').map((startsAt) => startsAt === appointment.startsAt
        ? { startsAt, available: false, reason: 'TAKEN' } : { startsAt, available: true }),
    }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agenda'));
    expect(reads.filter((path) => path === '/api/appointments')).toHaveLength(2);
    expect(reads).toContain(`/api/appointments/${appointment.id}`);
    expect(writes).toBe(1);
  });

  it('falha de rede sem criação preserva campos e horário até decisão explícita, sem retry de POST', async () => {
    const { router, fetch, user } = openNewAppointment('?date=2026-11-10');
    await screen.findByRole('button', { name: '10:00, disponível' });
    const original = fetch.getMockImplementation()!;
    let writes = 0;
    let agendaReads = 0;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).startsWith('/api/appointments') && init?.method === 'POST') {
        writes += 1;
        throw new TypeError('offline');
      }
      if (String(url).startsWith('/api/appointments')) {
        agendaReads += 1;
        return Response.json([]);
      }
      return original(url, init);
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), appointment.patient.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Exame' }), appointment.examType.id);
    await user.click(screen.getByRole('button', { name: '10:00, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Agendar exame' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agendar exame' })).toBeEnabled());
    expect(agendaReads).toBe(1);
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    expect(screen.getByRole('combobox', { name: 'Exame' })).toHaveValue(appointment.examType.id);
    expect(screen.getByRole('button', { name: '10:00, disponível' })).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.pathname).toBe('/agendamentos/novo');
    expect(writes).toBe(1);
  });
});
