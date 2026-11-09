import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { generateDaySlots, type StaffAppointment } from '@drlaudo/contract';
import { CancelDialog } from '../../components/product/CancelDialog';
import { Provider } from 'react-redux';
import { createMemoryRouter, parsePath, RouterProvider } from 'react-router';
import { createAppStore, type AppStore } from '../../app/store';
import { api } from '../../app/api';
import { setSession } from '../../app/authSlice';
import { makeSession } from '../../app/testFixtures';
import { AgendaPage } from './AgendaPage';
import { todayDate } from '../../lib/time';

const resources: { store: AppStore; router: { dispose: () => void } }[] = [];
afterEach(() => {
  cleanup();
  for (const { store, router } of resources.splice(0)) {
    router.dispose();
    store.dispose();
  }
  vi.restoreAllMocks();
});
const appointment: StaffAppointment = {
  id: '30000000-0000-4000-8000-000000000001', startsAt: '2026-11-10T13:00:00.000Z', status: 'SCHEDULED',
  patient: { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza' },
  examType: { id: '20000000-0000-4000-8000-000000000001', name: 'Raio-X de tórax' }, report: null,
};

describe('S3.17 S3.18 S6.7 S6.8: cancelar exige confirmação', () => {
  it('abrir não cancela e apresenta contexto com opção segura em foco', async () => {
    let calls = 0;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { calls += 1; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    expect(calls).toBe(0);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cancelar este agendamento?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('O cancelamento é definitivo e o horário ficará disponível.');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Raio-X de tórax');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('10:00');
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus();
  });
  it.each(['Voltar', 'Escape'])('desistir por %s não envia e devolve foco ao gatilho', async (action) => {
    let calls = 0;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { calls += 1; }} />);
    const trigger = screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' });
    await userEvent.click(trigger);
    if (action === 'Escape') await userEvent.keyboard('{Escape}');
    else await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls).toBe(0);
    expect(trigger).toHaveFocus();
  });
  it('preserva aviso explícito de rascunho bloqueado', async () => {
    render(<CancelDialog appointment={{ ...appointment, report: { id: '40000000-0000-4000-8000-000000000001', status: 'DRAFT' } }} pending={false} onConfirm={async () => { throw new Error('Não deve enviar ao abrir.'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('O rascunho será preservado e ficará bloqueado.');
  });
  it('só confirmação explícita executa a operação e fecha', async () => {
    let canceled = false;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { canceled = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    await userEvent.click(screen.getByRole('button', { name: /^Cancelar agendamento$/ }));
    expect(canceled).toBe(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
  it('envio pendente bloqueia cancelamento duplicado, desistência e Escape', async () => {
    const view = render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { throw new Error('Não deve reenviar.'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    view.rerender(<CancelDialog appointment={appointment} pending onConfirm={async () => { throw new Error('Não deve reenviar.'); }} />);
    expect(screen.getByRole('button', { name: 'Cancelando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

function openAgenda(path: string, options: { state?: unknown; loadAppointments?: () => Promise<Response>; loadPatients?: () => Promise<Response> } = {}) {
  const store = createAppStore();
  store.dispatch(setSession(makeSession('STAFF')));
  const router = createMemoryRouter([
    { path: '/agenda', element: <AgendaPage /> },
    { path: '/agendamentos/:id/laudo', element: <h1>Detalhe do agendamento</h1> },
  ], { initialEntries: [{ ...parsePath(path), state: options.state }] });
  resources.push({ store, router });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/patients')) return options.loadPatients ? options.loadPatients() : Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test' }]);
    return options.loadAppointments ? options.loadAppointments() : Response.json([appointment]);
  });
  render(<Provider store={store}><RouterProvider router={router} /></Provider>);
  return { store, router, fetch, user: userEvent.setup() };
}

describe('Continuidade da agenda', () => {
  it('localiza o agendamento recém-criado e oferece abrir o registro correto', async () => {
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&focus=${appointment.id}`, { state: { createdAppointmentId: appointment.id } });
    const open = await screen.findByRole('link', { name: 'Abrir agendamento' });
    expect(open).toHaveAttribute('href', `/agendamentos/${appointment.id}/laudo?date=2026-11-10`);
    expect(screen.getByRole('status')).toHaveTextContent('Exame agendado.');
    expect(screen.getAllByText('Recém-agendado')).toHaveLength(2);
    await user.click(open);
    expect(router.state.location.pathname).toBe(`/agendamentos/${appointment.id}/laudo`);
    expect(router.state.location.search).toBe('?date=2026-11-10');
  });

  it('o banner leva o contexto válido sem transportar foco ou estado de criação', async () => {
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}&focus=${appointment.id}`, {
      state: { createdAppointmentId: appointment.id },
    });
    await user.click(await screen.findByRole('link', { name: 'Abrir agendamento' }));
    expect(router.state.location.pathname).toBe(`/agendamentos/${appointment.id}/laudo`);
    expect(router.state.location.search).toBe(`?date=2026-11-10&patientId=${appointment.patient.id}`);
    expect(router.state.location.state).toBeNull();
  });

  it.each([
    [null, 'SCHEDULED', 'Criar laudo'],
    [{ id: '40000000-0000-4000-8000-000000000001', status: 'DRAFT' }, 'SCHEDULED', 'Editar laudo'],
    [{ id: '40000000-0000-4000-8000-000000000001', status: 'PUBLISHED' }, 'SCHEDULED', 'Ver laudo'],
    [null, 'CANCELED', 'Ver agendamento'],
  ] as const)('tabela e mobile transportam data/paciente ao %s em %s', async (report, status, action) => {
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`, {
      loadAppointments: async () => Response.json([{ ...appointment, report, status }]),
    });
    const links = await screen.findAllByRole('link', { name: action });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', `/agendamentos/${appointment.id}/laudo?date=2026-11-10&patientId=${appointment.patient.id}`);
    }
    await user.click(links[0]!);
    expect(router.state.location.search).toBe(`?date=2026-11-10&patientId=${appointment.patient.id}`);
  });

  it('abrir pela lista mobile sem filtro de paciente leva somente a data', async () => {
    const { router, user } = openAgenda('/agenda?date=2026-11-10');
    const links = await screen.findAllByRole('link', { name: 'Criar laudo' });
    await user.click(links[1]!);
    expect(router.state.location.pathname).toBe(`/agendamentos/${appointment.id}/laudo`);
    expect(router.state.location.search).toBe('?date=2026-11-10');
  });

  it.each([
    `date=2026-02-30&patientId=${appointment.patient.id}`,
    `date=2026-11-10&date=2026-11-10&patientId=${appointment.patient.id}`,
    'date=2026-11-10&patientId=invalido',
    `date=2026-11-10&patientId=${appointment.patient.id}&patientId=${appointment.patient.id}`,
  ])('não oferece links de detalhe com filtros inválidos ou duplicados: %s', async (query) => {
    openAgenda(`/agenda?${query}`);
    expect(screen.getByRole('alert')).toHaveTextContent('Os filtros informados são inválidos.');
    expect(screen.queryByRole('link', { name: /Criar laudo|Editar laudo|Ver laudo|Ver agendamento|Abrir agendamento/ })).not.toBeInTheDocument();
  });

  it.each([
    ['sem confirmação de criação', undefined],
    ['com confirmação de outro registro', { createdAppointmentId: '30000000-0000-4000-8000-000000000099' }],
  ])('focus na URL %s não inventa sucesso', async (_description, state) => {
    openAgenda(`/agenda?date=2026-11-10&focus=${appointment.id}`, { state });
    await screen.findAllByText('Ana Souza');
    expect(screen.queryByText('Exame agendado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir agendamento' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recém-agendado')).not.toBeInTheDocument();
  });

  it('não anuncia criação nem oferece abertura quando o id focado não está na agenda atual', async () => {
    const missingId = '30000000-0000-4000-8000-000000000099';
    openAgenda(`/agenda?date=2026-11-10&focus=${missingId}`, { state: { createdAppointmentId: missingId } });
    await screen.findAllByText('Ana Souza');
    expect(screen.queryByText('Exame agendado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir agendamento' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recém-agendado')).not.toBeInTheDocument();
  });

  it('retira sucesso e destaque enquanto reconcilia dados antigos e após erro', async () => {
    let calls = 0;
    const pending = Promise.withResolvers<Response>();
    const { store } = openAgenda(`/agenda?date=2026-11-10&focus=${appointment.id}`, {
      state: { createdAppointmentId: appointment.id },
      loadAppointments: async () => {
        calls += 1;
        if (calls === 1) return Response.json([appointment]);
        return pending.promise;
      },
    });
    await screen.findByRole('link', { name: 'Abrir agendamento' });
    act(() => { store.dispatch(api.util.invalidateTags(['Appointment'])); });
    await screen.findByText('Carregando agenda…');
    expect(screen.queryByText('Exame agendado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir agendamento' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recém-agendado')).not.toBeInTheDocument();
    pending.resolve(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' } }, { status: 500 }));
    await screen.findByText('Não foi possível carregar a agenda.');
    expect(screen.queryByText('Exame agendado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir agendamento' })).not.toBeInTheDocument();
  });

  it.each(['TR', 'ARTICLE'])('foca e rola somente o registro visível em %s', async (visibleTag) => {
    const scroll = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      this.scrollIntoView = scroll;
      const rectangles = this.tagName === visibleTag ? [new DOMRect(0, 0, 200, 80)] : [];
      return Object.assign(rectangles, { item: (index: number) => rectangles[index] ?? null });
    });
    openAgenda(`/agenda?date=2026-11-10&focus=${appointment.id}`, { state: { createdAppointmentId: appointment.id } });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-appointment-id', appointment.id));
    expect(document.activeElement?.tagName).toBe(visibleTag);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('mostra data por extenso e mantém paciente ao navegar entre dias e voltar a Hoje', async () => {
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`);
    await screen.findAllByText('Ana Souza');
    expect(screen.getByRole('heading', { name: /10 de novembro de 2026/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(router.state.location.search).toContain('date=2026-11-11');
    expect(router.state.location.search).toContain(`patientId=${appointment.patient.id}`);
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(router.state.location.search).toContain('date=2026-11-10');
    expect(router.state.location.search).toContain(`patientId=${appointment.patient.id}`);
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(router.state.location.search).toContain(`date=${todayDate()}`);
    expect(router.state.location.search).toContain(`patientId=${appointment.patient.id}`);
    expect(screen.getByText('Hoje', { selector: 'span' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Novo agendamento' })).toHaveAttribute('href', `/agendamentos/novo?date=${todayDate()}&patientId=${appointment.patient.id}`);
  });

  it.each([
    ['0001-01-01', 'Dia anterior', 'Próximo dia', '0001-01-02'],
    ['9999-12-31', 'Próximo dia', 'Dia anterior', '9999-12-30'],
  ])('respeita o limite %s sem perder o paciente', async (date, blocked, enabled, nextDate) => {
    const { router, user } = openAgenda(`/agenda?date=${date}&patientId=${appointment.patient.id}`);
    await screen.findAllByText('Ana Souza');
    expect(screen.getByRole('button', { name: blocked })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: enabled }));
    expect(router.state.location.search).toContain(`date=${nextDate}`);
    expect(router.state.location.search).toContain(`patientId=${appointment.patient.id}`);
  });

  it('Limpar filtros continua removendo paciente e data inválida', async () => {
    const { router, user } = openAgenda(`/agenda?date=2026-02-30&patientId=${appointment.patient.id}`);
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(router.state.location.search).toBe(`?date=${todayDate()}`);
  });

  it('falha do catálogo avisa, bloqueia filtro e permite retry sem perder data/paciente', async () => {
    let reads = 0;
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`, {
      loadPatients: async () => {
        reads += 1;
        return reads === 1
          ? Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' } }, { status: 500 })
          : Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test' }]);
      },
    });
    const retry = await screen.findByRole('button', { name: 'Tentar carregar pacientes novamente' });
    expect(screen.getByRole('alert')).toHaveTextContent(/pacientes/i);
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toBeDisabled();
    await user.click(retry);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Paciente' })).toBeEnabled());
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    expect(router.state.location.search).toBe(`?date=2026-11-10&patientId=${appointment.patient.id}`);
    expect(reads).toBe(2);
  });

  it('cancelamento incerto bloqueia outra mutação até reconciliar agenda, detalhe e slots', async () => {
    const { fetch, user } = openAgenda('/agenda?date=2026-11-10');
    await screen.findAllByRole('button', { name: 'Cancelar agendamento de Ana Souza' });
    const original = fetch.getMockImplementation()!;
    const detail = Promise.withResolvers<Response>();
    let writes = 0;
    const reads: string[] = [];
    fetch.mockImplementation(async (url, init) => {
      const request = new URL(String(url), 'http://localhost');
      if (init?.method === 'POST') {
        writes += 1;
        throw new TypeError('Resposta perdida');
      }
      reads.push(request.pathname);
      if (request.pathname === `/api/appointments/${appointment.id}`) return detail.promise;
      if (request.pathname === '/api/slots') return Response.json({
        date: '2026-11-10', timezone: 'America/Sao_Paulo',
        slots: generateDaySlots('2026-11-10').map((startsAt) => startsAt === appointment.startsAt
          ? { startsAt, available: false, reason: 'TAKEN' } : { startsAt, available: true }),
      });
      return original(url, init);
    });
    await user.click(screen.getAllByRole('button', { name: 'Cancelar agendamento de Ana Souza' })[0]!);
    await user.click(screen.getByRole('button', { name: /^Cancelar agendamento$/ }));
    await waitFor(() => expect(reads).toContain(`/api/appointments/${appointment.id}`));
    expect(screen.getByRole('button', { name: 'Cancelando…' })).toBeDisabled();
    expect(reads).toContain('/api/slots');
    detail.resolve(Response.json(appointment));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Cancelar agendamento de Ana Souza' }).every((button) => !button.hasAttribute('disabled'))).toBe(true);
    expect(writes).toBe(1);
  });
});
