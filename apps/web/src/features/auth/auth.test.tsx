import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../app/api';
import { resetSession, setSession } from '../../app/authSlice';
import { createAppStore, type AppStore } from '../../app/store';
import { appointment, makeSession } from '../../app/testFixtures';
import { createAppRouter } from '../../router';

const active: { store: AppStore; dispose: () => void }[] = [];
const unauthorized = { error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária ou credenciais inválidas.' } };
const internalError = { error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' } };
function openApp(path = '/login', authenticated?: 'STAFF' | 'PATIENT') {
  const store = createAppStore();
  if (authenticated) store.dispatch(setSession(makeSession(authenticated)));
  const router = createAppRouter({ initialEntries: [path] });
  active.push({ store, dispose: () => router.dispose() });
  render(<Provider store={store}><RouterProvider router={router} /></Provider>);
  return { store, router, user: userEvent.setup() };
}
function defaultFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/auth/me')) return Response.json(makeSession('STAFF').user);
    if (String(url).endsWith('/auth/login')) return Response.json(makeSession('STAFF'));
    return Response.json([]);
  });
}
afterEach(() => {
  cleanup();
  for (const item of active.splice(0)) {
    item.dispose();
    item.store.dispatch(resetSession());
    item.store.dispose();
  }
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('login e navegação autorizada', () => {
  it.each([
    ['Equipe', 'equipe@drlaudo.test'],
    ['Ana Souza', 'ana.souza@drlaudo.test'],
    ['Bruno Lima', 'bruno.lima@drlaudo.test'],
  ])('atalho %s apenas preenche credenciais', async (name, email) => {
    const fetch = defaultFetch();
    const { user, router } = openApp();
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
    expect(screen.getByLabelText('E-mail')).toHaveValue(email);
    expect(screen.getByLabelText('Senha')).toHaveValue('Demo@1234');
    expect(fetch).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/login');
  });
  it('valida campos e foca o primeiro inválido sem enviar HTTP', async () => {
    const fetch = defaultFetch();
    const { user } = openApp();
    await user.click(await screen.findByRole('button', { name: /^Entrar$/ }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-describedby');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['STAFF', '/agenda'],
    ['PATIENT', '/meus-exames'],
  ] as const)('login %s usa a home de seu perfil', async (role, home) => {
    const session = makeSession(role);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).endsWith('/auth/login') ? Response.json(session) : Response.json([]));
    const { user, router } = openApp();
    await user.click(await screen.findByRole('button', { name: role === 'STAFF' ? /^Equipe/ : /^Ana Souza/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(home));
    expect(JSON.parse(localStorage.getItem('drlaudo.session') ?? 'null')).toEqual(session);
    expect(localStorage.getItem('drlaudo.session')).not.toContain('Demo@1234');
  });
  it.each([
    ['STAFF', '/agendamentos/novo?date=2026-11-10', '/agendamentos/novo'],
    ['PATIENT', '/meus-exames/30000000-0000-4000-8000-000000000003/laudo', '/meus-exames/30000000-0000-4000-8000-000000000003/laudo'],
    ['STAFF', 'https://evil.test/agenda', '/agenda'],
    ['STAFF', '//evil.test/agenda', '/agenda'],
    ['STAFF', '/meus-exames', '/agenda'],
    ['PATIENT', '/agenda?date=2026-11-10', '/meus-exames'],
    ['PATIENT', '/nao-existe', '/meus-exames'],
  ] as const)('%s aceita somente retorno interno compatível: %s', async (role, destination, expected) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/login')) return Response.json(makeSession(role));
      return Response.json([]);
    });
    const { user, router } = openApp(`/login?returnTo=${encodeURIComponent(destination)}`);
    await user.click(await screen.findByRole('button', { name: role === 'STAFF' ? /^Equipe/ : /^Ana Souza/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(expected));
  });
  it('credencial recusada limpa senha, preserva e-mail e associa o erro', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(unauthorized, { status: 401 }));
    const { user, store } = openApp();
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('equipe@drlaudo.test');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Sua sessão expirou. Entre novamente.')).not.toBeInTheDocument();
    expect(store.getState().auth.notice).toBeNull();
  });
  it('respeita Retry-After e mantém os campos bloqueados durante a espera', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'RATE_LIMITED', message: 'Muitas tentativas de login. Tente novamente em instantes.' } }, { status: 429, headers: { 'Retry-After': '2' } }));
    const { user } = openApp();
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    expect(await screen.findByText('Muitas tentativas. Aguarde um minuto.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Aguarde 2 s/ })).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toHaveValue('equipe@drlaudo.test');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Entrar$/ })).toBeEnabled(), { timeout: 4000 });
  });
  it('bloqueia edição e envio duplo enquanto o login aguarda', async () => {
    const pending = Promise.withResolvers<Response>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
    const { user } = openApp();
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.dblClick(screen.getByRole('button', { name: /^Entrar$/ }));
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Senha')).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(Response.json(unauthorized, { status: 401 })));
  });
  it('DTO inválido nunca autentica nem mostra JSON recebido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ token: 'secret', user: { name: 'SENTINELA-INVALIDA' } }));
    const { user, store } = openApp();
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    expect(await screen.findByText('Algo deu errado. Tente novamente em instantes.')).toBeVisible();
    expect(store.getState().auth.session).toBeNull();
    expect(screen.queryByText('SENTINELA-INVALIDA')).not.toBeInTheDocument();
  });
  it('sem sessão redireciona URL privada sem disparar consulta privada', async () => {
    const fetch = defaultFetch();
    const { router } = openApp('/agendamentos/30000000-0000-4000-8000-000000000003/laudo');
    await screen.findByRole('heading', { name: 'Bem-vinda de volta' });
    expect(router.state.location.pathname).toBe('/login');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    `/agenda?date=2026-11-10&patientId=${appointment.patient.id}`,
    `/agendamentos/novo?date=2026-11-10&patientId=${appointment.patient.id}`,
    `/agendamentos/${appointment.id}/laudo?date=2026-11-10&patientId=${appointment.patient.id}`,
  ])('retoma a URL privada completa após login: %s', async (destination) => {
    defaultFetch();
    const { router, user } = openApp(destination);
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe(destination));
  });
  it.each([
    `/agendamentos/novo?date=2026-11-10&patientId=${appointment.patient.id}`,
    `/agendamentos/${appointment.id}/laudo?date=2026-11-10&patientId=${appointment.patient.id}`,
    `/agenda?date=2026-11-10&patientId=${appointment.patient.id}&focus=${appointment.id}`,
    '/pacientes',
  ])('retorno por query aceita contexto emitido pela aplicação: %s', async (destination) => {
    defaultFetch();
    const { router, user } = openApp(`/login?returnTo=${encodeURIComponent(destination)}`);
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe(destination));
  });
  it.each([
    '/\\evil.test/agenda', '/%2f%2fevil.test/agenda', '/agenda#https://evil.test',
    '/agenda?date=2026-11-10&date=2026-11-11',
    '/agendamentos/novo?date=2026-11-10&patientId=invalid',
    `/agendamentos/${appointment.id}/laudo?date=2026-11-10&returnTo=https://evil.test`,
  ])('descarta retorno adulterado sem navegação externa: %s', async (destination) => {
    defaultFetch();
    const { router, user } = openApp(`/login?returnTo=${encodeURIComponent(destination)}`);
    await user.click(await screen.findByRole('button', { name: /^Equipe/ }));
    await user.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agenda'));
  });
  it.each([
    ['PATIENT', '/agenda', '/meus-exames', '/api/appointments'],
    ['STAFF', '/meus-exames', '/agenda', '/api/me/appointments'],
  ] as const)('guard %s não dispara consulta proibida', async (role, path, home, forbidden) => {
    const fetch = defaultFetch();
    const { router } = openApp(path, role);
    await waitFor(() => expect(router.state.location.pathname).toBe(home));
    expect(fetch.mock.calls.some(([url]) => String(url).startsWith(forbidden))).toBe(false);
  });
  it('rota desconhecida oferece retorno correto e rodapé', async () => {
    defaultFetch();
    openApp('/pagina-desconhecida', 'PATIENT');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/meus-exames');
    expect(screen.getByText('Projeto fictício para desafio técnico · dados de demonstração')).toBeVisible();
  });
  it('shell tem skip link, usuário, navegação de paciente sem rascunhos e um h1', async () => {
    defaultFetch();
    openApp('/meus-exames', 'PATIENT');
    await screen.findByRole('heading', { level: 1, name: 'Meus exames' }, { timeout: 5000 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#conteudo');
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).not.toHaveTextContent('Rascunho');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(screen.getByText('Ana Souza')).toBeVisible();
  });
});

describe('isolamento e restauração da sessão', () => {
  it('F5 valida auth/me antes de qualquer consulta privada e não renova expiração', async () => {
    const session = makeSession('STAFF', Math.floor(Date.now() / 1000) - 1800);
    localStorage.setItem('drlaudo.session', JSON.stringify(session));
    const pending = Promise.withResolvers<Response>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).endsWith('/auth/me') ? pending.promise : Response.json([]));
    const { store } = openApp('/agenda');
    expect(await screen.findByText('Verificando sua sessão…')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/auth/me');
    expect(screen.queryByText('Equipe Dr. Laudo')).not.toBeInTheDocument();
    await act(async () => pending.resolve(Response.json(session.user)));
    await waitFor(() => expect(store.getState().auth.status).toBe('authenticated'));
    expect(store.getState().auth.session?.token).toBe(session.token);
    expect(JSON.parse(localStorage.getItem('drlaudo.session') ?? 'null')).toEqual(session);
  });
  it.each(['invalid', 'expired'] as const)('sessão %s é removida sem consulta privada', async (kind) => {
    localStorage.setItem('drlaudo.session', kind === 'invalid' ? '{"token":"invalid"}' : JSON.stringify(makeSession('STAFF', Math.floor(Date.now() / 1000) - 28800)));
    const fetch = defaultFetch();
    const { store, router } = openApp('/agenda');
    await screen.findByRole('heading', { name: 'Bem-vinda de volta' });
    expect(store.getState().auth.session).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('drlaudo.session')).toBeNull();
  });
  it.each(['network', '500'] as const)('restauração %s mantém privado bloqueado e permite retry', async (kind) => {
    const session = makeSession('STAFF');
    localStorage.setItem('drlaudo.session', JSON.stringify(session));
    const fetch = vi.spyOn(globalThis, 'fetch');
    if (kind === 'network') fetch.mockRejectedValueOnce(new TypeError('offline'));
    else fetch.mockResolvedValueOnce(Response.json(internalError, { status: 500 }));
    fetch.mockImplementation(async (url) => String(url).endsWith('/auth/me') ? Response.json(session.user) : Response.json([]));
    const { user, store } = openApp('/agenda');
    expect(await screen.findByText('Não foi possível verificar sua sessão.')).toBeVisible();
    expect(screen.queryByText('Equipe Dr. Laudo')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(store.getState().auth.status).toBe('authenticated'));
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
  });
  it('401 no auth/me limpa tudo e apresenta expiração', async () => {
    localStorage.setItem('drlaudo.session', JSON.stringify(makeSession('STAFF')));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(unauthorized, { status: 401 }));
    const { store } = openApp('/agenda');
    expect(await screen.findByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
    expect(store.getState().auth.session).toBeNull();
    expect(localStorage.getItem('drlaudo.session')).toBeNull();
  });
  it('Sair após falha de restauração funciona offline e substitui histórico', async () => {
    localStorage.setItem('drlaudo.session', JSON.stringify(makeSession('STAFF')));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { user, router, store } = openApp('/agenda?date=2026-11-10');
    await user.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(store.getState().auth.session).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('expira a sessão mesmo quando o timer dispara antes do prazo do token', async () => {
    defaultFetch();
    const { store, router } = openApp('/agenda', 'STAFF');
    await screen.findByRole('button', { name: 'Sair' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
    const issuedAt = Math.floor(Date.now() / 1000) - 28798;
    act(() => { store.dispatch(setSession(makeSession('STAFF', issuedAt))); });
    // Simula diferença de 1 ms entre o relógio civil e o timer monotônico.
    vi.setSystemTime(new Date('2026-11-10T11:59:59.999Z'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(store.getState().auth.status).toBe('authenticated');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().auth.session).toBeNull();
    expect(localStorage.getItem('drlaudo.session')).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });
  it.each(['logout', 'expiry', 'replacement', 'storage-clear', 'storage-replacement'] as const)('%s impede uma resposta antiga de repovoar DOM/cache', async (cause) => {
    const issuedAt = Math.floor(Date.now() / 1000) - 28798;
    const session = makeSession('STAFF', cause === 'expiry' ? issuedAt : undefined);
    const pending = Promise.withResolvers<Response>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/me')) return Response.json(session.user);
      if (String(url).startsWith('/api/appointments')) return pending.promise;
      return Response.json([]);
    });
    const { store, router } = openApp('/agenda?date=2026-11-10', cause === 'expiry' ? undefined : 'STAFF');
    let sessionGeneration = 0;
    if (cause === 'expiry') {
      act(() => { store.dispatch(setSession(session)); });
      sessionGeneration = store.getState().auth.generation;
    }
    await waitFor(() => {
      const calls = fetch.mock.calls.map(([u]) => (typeof u === 'object' && u && 'url' in u ? String(u.url) : String(u)));
      expect(calls.some((u) => u.includes('/api/appointments')), `Calls were: ${JSON.stringify(calls)}`).toBe(true);
    }, { timeout: 4000 });
    const generation = cause === 'expiry' ? sessionGeneration : store.getState().auth.generation;
    if (cause === 'logout') fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    if (cause === 'expiry') await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'), { timeout: 3500 });
    if (cause === 'replacement') act(() => { store.dispatch(setSession(makeSession('PATIENT'))); });
    if (cause === 'storage-clear' || cause === 'storage-replacement') {
      act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'drlaudo.session', newValue: cause === 'storage-clear' ? null : JSON.stringify(makeSession('PATIENT')), storageArea: localStorage })));
    }
    await act(async () => pending.resolve(Response.json([appointment])));
    await waitFor(() => expect(store.getState().auth.generation).toBeGreaterThan(generation));
    expect(screen.queryByText(appointment.patient.name)).not.toBeInTheDocument();
    expect(JSON.stringify(store.getState().api)).not.toContain(appointment.patient.name);
    if (cause === 'logout' || cause === 'storage-clear' || cause === 'expiry') {
      expect(router.state.location.pathname).toBe('/login');
      expect(router.state.location.search).toBe('');
      expect(localStorage.getItem('drlaudo.session')).toBeNull();
    }
  });
  it('storage de outra chave não invalida a sessão atual', async () => {
    defaultFetch();
    const { store } = openApp('/meus-exames', 'PATIENT');
    await screen.findByRole('heading', { level: 1 });
    const generation = store.getState().auth.generation;
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated.preference', newValue: 'true', storageArea: localStorage })));
    expect(store.getState().auth.generation).toBe(generation);
    expect(store.getState().auth.session?.user.name).toBe('Ana Souza');
  });
  it('logout aborta sinal de rede e remove dados privados já armazenados em cache', async () => {
    const fetch = defaultFetch();
    const { store, user, router } = openApp('/agenda', 'STAFF');
    await screen.findByRole('button', { name: 'Sair' });
    fetch.mockResolvedValueOnce(Response.json([appointment]));
    await act(async () => { await store.dispatch(api.endpoints.getAppointments.initiate({ date: '2026-11-12' })).unwrap(); });
    expect(JSON.stringify(store.getState().api)).toContain(appointment.patient.name);
    fetch.mockRejectedValue(new TypeError('offline'));
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(JSON.stringify(store.getState().api)).not.toContain(appointment.patient.name);
    expect(localStorage.getItem('drlaudo.session')).toBeNull();
  });
});
