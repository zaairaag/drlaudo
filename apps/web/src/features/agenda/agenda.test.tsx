import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { ReportPage } from '../reports/ReportPage';
import { todayDate } from '../../lib/time';

const resources: { store: AppStore; router: { dispose: () => void } }[] = [];
afterEach(() => {
  cleanup();
  for (const { store, router } of resources.splice(0)) {
    router.dispose();
    store.dispose();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    { path: '/agendamentos/:id/laudo', element: <ReportPage /> },
  ], { initialEntries: [{ ...parsePath(path), state: options.state }] });
  resources.push({ store, router });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const path = new URL(String(url), 'http://localhost').pathname;
    if (path === `/api/appointments/${appointment.id}/report`) return Response.json({
      error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' },
    }, { status: 404 });
    if (path === `/api/appointments/${appointment.id}`) return Response.json(appointment);
    if (String(url).includes('/patients')) return options.loadPatients ? options.loadPatients() : Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test', active: true }]);
    return options.loadAppointments ? options.loadAppointments() : Response.json([appointment]);
  });
  render(<Provider store={store}><RouterProvider router={router} /></Provider>);
  return { store, router, fetch, user: userEvent.setup() };
}

describe('Calendário mensal', () => {
  it('entra sem contexto no calendário consultando todos os períodos sem buscar primeiro o dia', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00.000Z'));
    const { router, fetch } = openAgenda('/agenda');

    expect(await screen.findByRole('grid', { name: /novembro.*2026/i })).toBeVisible();
    expect(router.state.location.search).toBe('?scope=all&view=calendar&calendarDate=2026-11-10');
    expect(fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/appointments'))).toEqual(['/api/appointments?scope=all']);
    expect(screen.getByRole('button', { name: 'Calendário', pressed: true })).toBeVisible();
  });

  it('alterna exclusivamente entre os três modos preservando paciente e data selecionada', async () => {
    const { router, user, fetch } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    const modes = screen.getByRole('group', { name: 'Visualização da agenda' });
    expect(within(modes).getByRole('button', { name: 'Dia', pressed: true })).toBeVisible();
    expect(within(modes).getAllByRole('button', { pressed: true })).toHaveLength(1);

    await user.click(within(modes).getByRole('button', { name: 'Calendário' }));
    expect(await screen.findByRole('button', { name: /10 de novembro de 2026.*1 exame/i })).toBeVisible();
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}&view=calendar&calendarDate=2026-11-10`);
    expect(within(modes).getByRole('button', { name: 'Calendário', pressed: true })).toBeVisible();
    expect(within(modes).getAllByRole('button', { pressed: true })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /11 de novembro de 2026.*0 exames/i }));
    expect(await screen.findByText('Nenhum exame neste dia para os filtros selecionados.')).toBeVisible();
    expect(screen.getByRole('grid')).toBeVisible();
    await user.click(within(modes).getByRole('button', { name: 'Dia' }));
    expect(router.state.location.search).toBe(`?date=2026-11-11&patientId=${appointment.patient.id}`);
    expect(within(modes).getByRole('button', { name: 'Dia', pressed: true })).toBeVisible();
    expect(within(modes).getAllByRole('button', { pressed: true })).toHaveLength(1);

    await user.click(within(modes).getByRole('button', { name: 'Linha do tempo' }));
    expect(await screen.findByRole('heading', { name: 'Todos os agendamentos' })).toBeVisible();
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}`);
    expect(within(modes).getByRole('button', { name: 'Linha do tempo', pressed: true })).toBeVisible();
    expect(within(modes).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(fetch.mock.calls.map(([url]) => String(url))).toContain(`/api/appointments?scope=all&patientId=${appointment.patient.id}`);
    for (const [url] of fetch.mock.calls) expect(String(url)).not.toMatch(/\/api\/.*(?:view=|calendarDate=)/);
  });

  it('mantém foco nas setas e só leva aos exames do dia por ação explícita, inclusive no dia vazio', async () => {
    const { router, user } = openAgenda('/agenda?scope=all&view=calendar&calendarDate=2026-11-10');
    const selected = await screen.findByRole('button', { name: /10 de novembro de 2026.*1 exame/i });
    selected.focus();
    await user.keyboard('{ArrowRight}');
    const nextDay = screen.getByRole('button', { name: /11 de novembro de 2026.*0 exames/i });
    expect(nextDay).toHaveFocus();
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(selected);
    expect(router.state.location.search).toBe('?scope=all&view=calendar&calendarDate=2026-11-10');

    await user.keyboard('{Enter}');
    expect(router.state.location.search).toBe('?scope=all&view=calendar&calendarDate=2026-11-11');
    expect(nextDay).toHaveFocus();
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(nextDay);
    expect(await screen.findByText('Nenhum exame neste dia para os filtros selecionados.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Ver exames do dia (0)' }));
    expect(screen.getByRole('heading', { name: /11 de novembro de 2026/i })).toHaveFocus();
    expect(screen.getByRole('grid')).toBeVisible();
  });

  it.each([
    ['date=2026-11-10', '2026-11-10'],
    ['scope=all&view=calendar&calendarDate=2026-11-10', '2026-11-10'],
    ['scope=all', null],
  ])('preserva o contexto %s no retorno do novo agendamento', async (query, date) => {
    const context = `/agenda?${query}&patientId=${appointment.patient.id}`;
    openAgenda(context);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    const href = screen.getByRole('link', { name: 'Novo agendamento' }).getAttribute('href')!;
    const target = new URL(href, 'http://localhost');
    expect(target.pathname).toBe('/agendamentos/novo');
    expect(target.searchParams.get('date')).toBe(date ?? todayDate());
    expect(target.searchParams.get('patientId')).toBe(appointment.patient.id);
    const returnTo = new URL(target.searchParams.get('returnTo')!, 'http://localhost');
    expect(returnTo.pathname).toBe('/agenda');
    expect(Object.fromEntries(returnTo.searchParams)).toEqual(Object.fromEntries(new URL(context, 'http://localhost').searchParams));
  });

  it('detalha somente o dia escolhido com horário, situação e acesso ao registro correto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T15:00:00.000Z'));
    const otherDay = { ...appointment, id: '30000000-0000-4000-8000-000000000002', startsAt: '2026-11-11T13:00:00.000Z' };
    openAgenda(`/agenda?scope=all&view=calendar&calendarDate=2026-11-10&focus=${appointment.id}`, {
      state: { createdAppointmentId: appointment.id },
      loadAppointments: async () => Response.json([appointment, otherDay]),
    });
    const detail = await screen.findByRole('region', { name: /10 de novembro de 2026/i });
    const item = within(detail).getByRole('article');
    expect(item).toHaveAttribute('data-appointment-id', appointment.id);
    expect(item).toHaveTextContent('10:00');
    expect(item).toHaveTextContent('Ana Souza');
    expect(item).toHaveTextContent('Raio-X de tórax');
    expect(within(item).getByText('Agendado')).toBeVisible();
    expect(within(item).getByText('Data passada')).toBeVisible();
    expect(within(item).getByText('Recém-agendado')).toBeVisible();
    expect(within(item).getByRole('link', { name: 'Criar laudo' })).toHaveAttribute('href', `/agendamentos/${appointment.id}/laudo?scope=all&view=calendar&calendarDate=2026-11-10`);
    expect(within(detail).getAllByRole('article')).toHaveLength(1);
  });

  it('restaura dia e mês do calendário após abrir e voltar do laudo', async () => {
    const path = `/agenda?scope=all&patientId=${appointment.patient.id}&view=calendar&calendarDate=2026-11-10`;
    const { router, user } = openAgenda(path);
    const link = await screen.findByRole('link', { name: 'Criar laudo' });
    await user.click(link);
    await user.click(await screen.findByRole('link', { name: 'Voltar para agenda' }));
    expect(router.state.location.pathname + router.state.location.search).toBe(path);
    expect(await screen.findByRole('heading', { name: 'Terça-feira, 10 de novembro de 2026' })).toBeVisible();
  });

  it.each(['2026-02-30', '2026-11-10&calendarDate=2026-11-11'])('não consulta contexto de calendário inválido: %s', async (date) => {
    const { fetch } = openAgenda(`/agenda?scope=all&view=calendar&calendarDate=${date}`);
    expect(await screen.findByText('Os filtros informados são inválidos.')).toBeVisible();
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/appointments'))).toHaveLength(0);
  });
});

describe('Todos os agendamentos', () => {
  it('troca o dia pela linha do tempo sem perder o paciente e sem exibir uma data vazia', async () => {
    const { router, fetch, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    const all = screen.getByRole('button', { name: 'Linha do tempo', pressed: false });
    all.focus();
    await user.keyboard(' ');

    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();
    expect(screen.getByText('Todos os períodos')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    expect(screen.getByRole('region', { name: 'Paciente selecionado' })).toHaveTextContent('Ana Souza');
    expect(screen.queryByRole('button', { name: 'Dia anterior' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Próximo dia' })).not.toBeInTheDocument();
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    expect(fetch.mock.calls.map(([url]) => String(url))).toContain(`/api/appointments?scope=all&patientId=${appointment.patient.id}`);
  });

  it.each(['', `&patientId=${appointment.patient.id}`])('restaura o modo completo pela URL após recarga: %s', async (patientQuery) => {
    const path = `/agenda?scope=all${patientQuery}`;
    const { router, fetch } = openAgenda(path);
    const links = await screen.findAllByRole('link', { name: 'Criar laudo' });

    expect(screen.getByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Linha do tempo', pressed: true })).toBeVisible();
    if (patientQuery) expect(screen.getByRole('region', { name: 'Paciente selecionado' })).toHaveTextContent('Ana Souza');
    else expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('');
    expect(router.state.location.pathname + router.state.location.search).toBe(path);
    expect(fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/appointments'))).toEqual([`/api/appointments?scope=all${patientQuery}`]);
    for (const link of links) expect(link).toHaveAttribute('href', `/agendamentos/${appointment.id}/laudo?scope=all${patientQuery}`);
  });

  it('muda e limpa o paciente sem abandonar todos os agendamentos', async () => {
    const otherPatient = { id: '10000000-0000-4000-8000-000000000003', name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', active: false };
    const { router, user } = openAgenda(`/agenda?scope=all&patientId=${appointment.patient.id}`, {
      loadPatients: async () => Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test', active: true }, otherPatient]),
    });
    const patient = screen.getByRole('combobox', { name: 'Paciente' });
    await waitFor(() => expect(patient).toBeEnabled());

    await user.selectOptions(patient, otherPatient.id);
    expect(router.state.location.search).toBe(`?scope=all&patientId=${otherPatient.id}`);
    expect(screen.getByRole('region', { name: 'Paciente selecionado' })).toHaveTextContent('Bruno Lima');
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();

    await user.selectOptions(patient, '');
    expect(router.state.location.search).toBe('?scope=all');
    expect(screen.queryByRole('region', { name: 'Paciente selecionado' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
  });

  it('Dia volta ao modo diário e conserva o paciente antes de navegar para outra data', async () => {
    const { router, user } = openAgenda(`/agenda?scope=all&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    await user.click(screen.getByRole('button', { name: 'Dia' }));
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-12-15' } });

    expect(router.state.location.search).toBe(`?date=2026-12-15&patientId=${appointment.patient.id}`);
    expect(screen.getByLabelText('Data')).toHaveValue('2026-12-15');
    expect(screen.getByRole('button', { name: 'Dia', pressed: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hoje' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeEnabled();
    expect(screen.queryByRole('heading', { level: 2, name: 'Todos os agendamentos' })).not.toBeInTheDocument();
  });

  it.each([
    ['date=2026-11-10', 'Dia', `?date=2026-11-09&patientId=${appointment.patient.id}`],
    ['scope=all&view=calendar&calendarDate=2026-11-10', 'Calendário', `?scope=all&patientId=${appointment.patient.id}&view=calendar&calendarDate=2026-11-09`],
  ])('Hoje muda somente a data em %s preservando modo e paciente', async (query, mode, expectedSearch) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
    const { router, user } = openAgenda(`/agenda?${query}&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    const today = screen.getByRole('button', { name: 'Hoje' });
    expect(today).not.toHaveAttribute('aria-pressed');
    await user.click(today);
    expect(router.state.location.search).toBe(expectedSearch);
    expect(screen.getByRole('button', { name: mode, pressed: true })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
  });

  it('restaura modo e filtros ao voltar e avançar no histórico', async () => {
    const { router, user } = openAgenda(`/agenda?date=2026-11-10&patientId=${appointment.patient.id}`);
    await screen.findAllByRole('link', { name: 'Criar laudo' });
    await user.click(screen.getByRole('button', { name: 'Linha do tempo' }));
    await screen.findByRole('heading', { level: 2, name: 'Todos os agendamentos' });
    await user.click(screen.getByRole('button', { name: 'Dia' }));

    await act(async () => { await router.navigate(-1); });
    expect(screen.getByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}`);

    await act(async () => { await router.navigate(-1); });
    expect(screen.getByLabelText('Data')).toHaveValue('2026-11-10');
    expect(router.state.location.search).toBe(`?date=2026-11-10&patientId=${appointment.patient.id}`);

    await act(async () => { await router.navigate(1); });
    expect(screen.getByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
  });

  it('agrupa cronologicamente por mês civil de SP e diferencia data de situação clínica', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T01:30:00.000Z'));
    const past = { ...appointment, startsAt: '2026-11-30T02:30:00.000Z', report: { id: '40000000-0000-4000-8000-000000000001', status: 'DRAFT' } };
    const today = { ...appointment, id: '30000000-0000-4000-8000-000000000002', startsAt: '2026-12-01T02:30:00.000Z', report: { id: '40000000-0000-4000-8000-000000000002', status: 'PUBLISHED' } };
    const future = { ...appointment, id: '30000000-0000-4000-8000-000000000003', startsAt: '2026-12-01T03:00:00.000Z', status: 'CANCELED', report: { id: '40000000-0000-4000-8000-000000000003', status: 'DRAFT' } };
    openAgenda('/agenda?scope=all', { loadAppointments: async () => Response.json([future, today, past]) });
    const november = await screen.findByRole('region', { name: 'Novembro de 2026' });
    const december = screen.getByRole('region', { name: 'Dezembro de 2026' });
    const articles = screen.getAllByRole('article');
    expect(articles.map((item) => item.dataset.appointmentId)).toEqual([past.id, today.id, future.id]);
    expect(within(november).getAllByRole('article')).toHaveLength(2);
    expect(within(december).getAllByRole('article')).toHaveLength(1);
    expect(articles[0]).toHaveTextContent('29/11/2026 às 23:30');
    expect(articles[0]).toHaveTextContent('Data passada');
    expect(within(articles[0]!).getByRole('link', { name: 'Editar laudo' })).toBeVisible();
    expect(articles[1]).toHaveTextContent('30/11/2026 às 23:30');
    expect(articles[1]).toHaveTextContent('Hoje');
    expect(within(articles[1]!).getByText('Publicado')).toBeVisible();
    expect(within(articles[1]!).getByRole('link', { name: 'Ver laudo' })).toBeVisible();
    expect(within(articles[1]!).queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
    expect(within(articles[1]!).queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
    expect(articles[2]).toHaveTextContent('01/12/2026 às 00:00');
    expect(articles[2]).toHaveTextContent('Próximo exame');
    expect(within(articles[2]!).getByText('Cancelado')).toBeVisible();
    expect(within(articles[2]!).getByRole('link', { name: 'Ver agendamento' })).toBeVisible();
    expect(within(articles[2]!).queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/realizado/i)).not.toBeInTheDocument();
  });

  it('abre o laudo pela linha do tempo e volta ao modo completo com o mesmo paciente', async () => {
    const { router, user } = openAgenda(`/agenda?scope=all&patientId=${appointment.patient.id}`);
    await user.click(await screen.findByRole('link', { name: 'Criar laudo' }));
    await screen.findByLabelText('Título');
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}`);

    await user.click(screen.getByRole('link', { name: 'Voltar para agenda' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Todos os agendamentos' })).toBeVisible();
    expect(router.state.location.search).toBe(`?scope=all&patientId=${appointment.patient.id}`);
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
  });

  it.each(['date=2026-11-10', 'scope=all', 'scope=all&view=calendar&calendarDate=2026-11-10'])('edita nome e email pela agenda sem perder o contexto %s', async (query) => {
    let currentPatient = { ...appointment.patient, email: 'ana.souza@drlaudo.test', active: false };
    const { router, fetch, user } = openAgenda(`/agenda?${query}&patientId=${appointment.patient.id}`, {
      loadPatients: async () => Response.json([currentPatient]),
      loadAppointments: async () => Response.json([{ ...appointment, patient: { id: currentPatient.id, name: currentPatient.name } }]),
    });
    const trigger = await screen.findByRole('button', { name: 'Editar paciente' });
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    const initialSearch = router.state.location.search;
    const original = fetch.getMockImplementation()!;
    let submitted: unknown;
    fetch.mockImplementation(async (url, init) => {
      if (init?.method === 'PATCH') {
        expect(String(url)).toBe(`/api/patients/${currentPatient.id}`);
        submitted = JSON.parse(String(init.body));
        currentPatient = { ...currentPatient, name: 'Ana Atualizada', email: 'ana.nova@drlaudo.test' };
        return Response.json(currentPatient);
      }
      return original(url, init);
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    let dialog = await screen.findByRole('dialog', { name: 'Editar paciente' });
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(submitted).toBeUndefined();
    await user.click(trigger);
    dialog = await screen.findByRole('dialog', { name: 'Editar paciente' });
    await user.clear(within(dialog).getByLabelText('Nome'));
    await user.type(within(dialog).getByLabelText('Nome'), 'Ana Atualizada');
    await user.clear(within(dialog).getByLabelText('E-mail'));
    await user.type(within(dialog).getByLabelText('E-mail'), 'ANA.NOVA@DRLAUDO.TEST');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(submitted).toEqual({ name: 'Ana Atualizada', email: 'ana.nova@drlaudo.test' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Paciente selecionado' })).toHaveTextContent('Ana Atualizada'));
    expect(router.state.location.search).toBe(initialSearch);
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(appointment.patient.id);
    expect(screen.getByText('Inativo')).toBeVisible();
  });

  it.each([
    'scope=',
    'scope=ALL',
    'scope=daily',
    'scope=all&scope=all',
    'scope=all&scope=daily',
    'scope=all&date=2026-11-10',
    'scope=all&date=',
    'scope=all&patientId=invalido',
    `scope=all&patientId=${appointment.patient.id}&patientId=${appointment.patient.id}`,
  ])('exibe erro sem consultar agendamentos nem reescrever filtros inválidos: %s', async (query) => {
    const { router, fetch } = openAgenda(`/agenda?${query}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Os filtros informados são inválidos.');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Paciente' })).toBeEnabled());
    expect(router.state.location.search).toBe(`?${query}`);
    expect(fetch.mock.calls.map(([url]) => new URL(String(url), 'http://localhost').pathname)).not.toContain('/api/appointments');
    expect(screen.queryByRole('link', { name: /Criar laudo|Editar laudo|Ver laudo|Ver agendamento/ })).not.toBeInTheDocument();
  });
});

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
    expect(new URL(screen.getByRole('link', { name: 'Novo agendamento' }).getAttribute('href')!, 'http://localhost').searchParams.get('returnTo')).toBe(`/agenda?date=${todayDate()}&patientId=${appointment.patient.id}`);
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
          : Response.json([{ ...appointment.patient, email: 'ana.souza@drlaudo.test', active: true }]);
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
