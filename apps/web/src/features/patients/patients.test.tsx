import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../app/api';
import { resetSession, setSession } from '../../app/authSlice';
import { createAppStore, type AppStore } from '../../app/store';
import { appointment, makeSession } from '../../app/testFixtures';
import { createAppRouter } from '../../router';

const patient = { ...appointment.patient, email: 'ana.souza@drlaudo.test' };
const createdPatient = { id: '10000000-0000-4000-8000-000000000099', name: 'Carla Lima', email: 'carla@drlaudo.test' };
const resources: { store: AppStore; dispose: () => void }[] = [];
function openPatients(role: 'STAFF' | 'PATIENT' = 'STAFF') {
  const store = createAppStore();
  store.dispatch(setSession(makeSession(role)));
  const router = createAppRouter({ initialEntries: ['/pacientes'] });
  resources.push({ store, dispose: () => router.dispose() });
  render(<Provider store={store}><RouterProvider router={router} /></Provider>);
  return { store, router, user: userEvent.setup() };
}
afterEach(() => {
  cleanup();
  for (const { store, dispose } of resources.splice(0)) { dispose(); store.dispatch(resetSession()); store.dispose(); }
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('administração de pacientes STAFF pelo router de produto', () => {
  it('lista pacientes e cadastra com campos associados, foco e DTO normalizado sem senha na lista', async () => {
    let created = false;
    let submitted: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url) === '/api/patients' && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body));
        created = true;
        return Response.json(createdPatient, { status: 201 });
      }
      return Response.json(created ? [patient, createdPatient] : [patient]);
    });
    const { user } = openPatients();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pacientes' })).toBeVisible();
    await screen.findByText(patient.email);
    const trigger = screen.getByRole('button', { name: 'Novo paciente' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Novo paciente' });
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Nome'), '  Carla Lima  ');
    await user.type(within(dialog).getByLabelText('E-mail'), ' CARLA@DRLAUDO.TEST ');
    await user.type(within(dialog).getByLabelText('Senha'), ' Literal@123 ');
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar paciente' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(createdPatient.email)).toBeVisible();
    expect(submitted).toEqual({ name: 'Carla Lima', email: 'carla@drlaudo.test', password: ' Literal@123 ' });
    expect(screen.queryByText(' Literal@123 ')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('button', { name: /excluir|apagar/i })).not.toBeInTheDocument();
  });

  it('editar usa PATCH sem senha e invalida nomes de paciente em agenda e detalhe já assinados', async () => {
    let edited = false;
    let submitted: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (init?.method === 'PATCH') {
        expect(String(url)).toBe(`/api/patients/${patient.id}`);
        submitted = JSON.parse(String(init.body));
        edited = true;
        return Response.json({ ...patient, name: 'Ana Revisada' });
      }
      const current = edited ? { ...patient, name: 'Ana Revisada' } : patient;
      if (String(url).startsWith('/api/appointments')) {
        const item = { ...appointment, patient: { id: current.id, name: current.name } };
        return Response.json(String(url) === `/api/appointments/${appointment.id}` ? item : [item]);
      }
      return Response.json([current]);
    });
    const { store, user } = openPatients();
    await screen.findByText(patient.email);
    const list = store.dispatch(api.endpoints.getAppointments.initiate({ date: '2026-11-10' }));
    const detail = store.dispatch(api.endpoints.getAppointment.initiate(appointment.id));
    await act(async () => { await Promise.all([list.unwrap(), detail.unwrap()]); });
    await user.click(screen.getByRole('button', { name: 'Editar paciente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar paciente' });
    expect(within(dialog).queryByLabelText('Senha')).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Nome'));
    await user.type(within(dialog).getByLabelText('Nome'), 'Ana Revisada');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(submitted).toMatchObject({ name: 'Ana Revisada' });
    expect(submitted).not.toHaveProperty('password');
    await waitFor(() => {
      expect(api.endpoints.getAppointments.select({ date: '2026-11-10' })(store.getState()).data?.[0]?.patient.name).toBe('Ana Revisada');
      expect(api.endpoints.getAppointment.select(appointment.id)(store.getState()).data?.patient.name).toBe('Ana Revisada');
    });
    list.unsubscribe(); detail.unsubscribe();
  });

  it('valida por contrato antes de HTTP, associa erros e mantém o primeiro campo inválido em foco', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([patient]));
    const { user } = openPatients();
    await user.click(await screen.findByRole('button', { name: 'Novo paciente' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar paciente' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus();
    for (const label of ['Nome', 'E-mail', 'Senha']) expect(within(dialog).getByLabelText(label)).toHaveAttribute('aria-describedby');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it.each([
    ['Nome', 'ab'],
    ['Nome', 'x'.repeat(121)],
    ['E-mail', 'invalido'],
    ['Senha', '1234567'],
    ['Senha', 'é'.repeat(37)],
  ])('limites contratuais de %s são associados ao campo sem POST', async (label, value) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([patient]));
    const { user } = openPatients();
    await user.click(await screen.findByRole('button', { name: 'Novo paciente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome'), createdPatient.name);
    await user.type(within(dialog).getByLabelText('E-mail'), createdPatient.email);
    await user.type(within(dialog).getByLabelText('Senha'), 'Senha@123');
    await user.clear(within(dialog).getByLabelText(label));
    await user.type(within(dialog).getByLabelText(label), value);
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar paciente' }));
    await waitFor(() => expect(within(dialog).getByLabelText(label)).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByLabelText(label)).toHaveFocus();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('cadastro pendente impede envio duplo e saída acidental sem limpar os campos', async () => {
    const pending = Promise.withResolvers<Response>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST' ? pending.promise : Response.json([patient]));
    const { user } = openPatients();
    await user.click(await screen.findByRole('button', { name: 'Novo paciente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome'), createdPatient.name);
    await user.type(within(dialog).getByLabelText('E-mail'), createdPatient.email);
    await user.type(within(dialog).getByLabelText('Senha'), 'Senha@123');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Cadastrar paciente' }));
    expect(within(dialog).getByLabelText('Nome')).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    await act(async () => pending.resolve(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' } }, { status: 500 })));
    await waitFor(() => expect(within(dialog).getByLabelText('Nome')).toBeEnabled());
    expect(within(dialog).getByLabelText('Nome')).toHaveValue(createdPatient.name);
  });

  it('EMAIL_TAKEN mantém campos, associa erro ao email e não fecha formulário nem repete POST', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({ error: { code: 'EMAIL_TAKEN', message: 'Este e-mail já está cadastrado.' } }, { status: 409 })
      : Response.json([patient]));
    const { user } = openPatients();
    await user.click(await screen.findByRole('button', { name: 'Novo paciente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome'), createdPatient.name);
    await user.type(within(dialog).getByLabelText('E-mail'), createdPatient.email);
    await user.type(within(dialog).getByLabelText('Senha'), 'Senha@123');
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar paciente' }));
    await waitFor(() => expect(within(dialog).getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByLabelText('E-mail')).toHaveFocus();
    expect(within(dialog).getByLabelText('Nome')).toHaveValue(createdPatient.name);
    expect(within(dialog).getByLabelText('Senha')).toHaveValue('Senha@123');
    expect(within(dialog).getByText('Este e-mail já está cadastrado.')).toBeVisible();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('erro de catálogo oferece retry sem exibir formulário administrativo acionável', async () => {
    let reads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ++reads === 1
      ? Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' } }, { status: 500 })
      : Response.json([patient]));
    const { user } = openPatients();
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.getByRole('button', { name: 'Novo paciente' })).toBeDisabled();
    await user.click(retry);
    expect(await screen.findByText(patient.email)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo paciente' })).toBeEnabled();
  });

  it('paciente não recebe navegação nem consulta administrativa ao abrir /pacientes', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]));
    const { router } = openPatients('PATIENT');
    await waitFor(() => expect(router.state.location.pathname).toBe('/meus-exames'));
    expect(screen.queryByRole('link', { name: 'Pacientes' })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/patients'))).toBe(false);
  });
});
