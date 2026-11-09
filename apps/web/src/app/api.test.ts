import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { resetSession, setSession } from './authSlice';
import { createAppStore, type AppStore } from './store';
import { appointment, makeSession, patientReport, report } from './testFixtures';

const stores: AppStore[] = [];
function staffStore() {
  const store = createAppStore();
  stores.push(store);
  store.dispatch(setSession(makeSession('STAFF')));
  return store;
}
function respond(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, ...(headers ? { headers } : {}) });
}
const internalError = {
  error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' },
};
const unauthorized = {
  error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária ou credenciais inválidas.' },
};
afterEach(() => {
  for (const store of stores.splice(0)) { store.dispatch(resetSession()); store.dispose(); }
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('transporte validado /api', () => {
  it('envia bearer, filtros conhecidos e no-store sem repetir uma leitura', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond([appointment]));
    const store = staffStore();
    const result = await store.dispatch(api.endpoints.getAppointments.initiate({ date: '2026-11-10' })).unwrap();
    expect(result).toEqual([appointment]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/appointments?date=2026-11-10');
    expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${store.getState().auth.session?.token}`);
    expect(options?.cache).toBe('no-store');
  });

  const invalidResponses = [
    ['login', (store: AppStore) => store.dispatch(api.endpoints.login.initiate({ email: 'equipe@drlaudo.test', password: 'Demo@1234' })).unwrap()],
    ['getMe', (store: AppStore) => store.dispatch(api.endpoints.getMe.initiate()).unwrap()],
    ['getPatients', (store: AppStore) => store.dispatch(api.endpoints.getPatients.initiate()).unwrap()],
    ['createPatient', (store: AppStore) => store.dispatch(api.endpoints.createPatient.initiate({ name: 'Nova Paciente', email: 'nova@drlaudo.test', password: 'Senha@123' })).unwrap()],
    ['updatePatient', (store: AppStore) => store.dispatch(api.endpoints.updatePatient.initiate({ id: appointment.patient.id, name: 'Nome revisado' })).unwrap()],
    ['getExamTypes', (store: AppStore) => store.dispatch(api.endpoints.getExamTypes.initiate()).unwrap()],
    ['getSlots', (store: AppStore) => store.dispatch(api.endpoints.getSlots.initiate({ date: '2026-11-10' })).unwrap()],
    ['getAppointments', (store: AppStore) => store.dispatch(api.endpoints.getAppointments.initiate({})).unwrap()],
    ['getAppointment', (store: AppStore) => store.dispatch(api.endpoints.getAppointment.initiate(appointment.id)).unwrap()],
    ['createAppointment', (store: AppStore) => store.dispatch(api.endpoints.createAppointment.initiate({ patientId: appointment.patient.id, examTypeId: appointment.examType.id, startsAt: appointment.startsAt })).unwrap()],
    ['cancelAppointment', (store: AppStore) => store.dispatch(api.endpoints.cancelAppointment.initiate(appointment.id)).unwrap()],
    ['getReport', (store: AppStore) => store.dispatch(api.endpoints.getReport.initiate(appointment.id)).unwrap()],
    ['createReport', (store: AppStore) => store.dispatch(api.endpoints.createReport.initiate({ appointmentId: appointment.id, title: report.title, body: report.body, professionalName: report.professionalName })).unwrap()],
    ['updateReport', (store: AppStore) => store.dispatch(api.endpoints.updateReport.initiate({ id: report.id, title: 'Título revisado' })).unwrap()],
    ['publishReport', (store: AppStore) => store.dispatch(api.endpoints.publishReport.initiate(report.id)).unwrap()],
    ['getMyAppointments', (store: AppStore) => store.dispatch(api.endpoints.getMyAppointments.initiate()).unwrap()],
    ['getMyReport', (store: AppStore) => store.dispatch(api.endpoints.getMyReport.initiate(appointment.id)).unwrap()],
  ] as const;
  it.each(invalidResponses)('%s rejeita DTO inválido sem expor o conteúdo recebido', async (_name, execute) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ privateField: 'SENTINELA-NAO-EXIBIR' }));
    const store = staffStore();
    await expect(execute(store)).rejects.toMatchObject({ status: 500, data: internalError });
    expect(JSON.stringify(store.getState().api)).not.toContain('SENTINELA-NAO-EXIBIR');
  });

  it.each([true, false])('valida atividade %s em listagem, cadastro e edição sem alterar DTO de sessão', async (active) => {
    const patient = { ...appointment.patient, email: 'ana.souza@drlaudo.test', active };
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url) === '/api/patients' && init?.method === 'GET') return respond([patient]);
      return respond(init?.method === 'POST' ? { ...patient, active: true } : patient, init?.method === 'POST' ? 201 : 200);
    });
    const store = staffStore();
    expect(await store.dispatch(api.endpoints.getPatients.initiate()).unwrap()).toEqual([patient]);
    expect(await store.dispatch(api.endpoints.createPatient.initiate({ name: patient.name, email: patient.email, password: 'Senha@123' })).unwrap()).toEqual({ ...patient, active: true });
    expect(await store.dispatch(api.endpoints.updatePatient.initiate({ id: patient.id, active })).unwrap()).toEqual(patient);
    const patch = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ active });
    expect(store.getState().auth.session?.user).not.toHaveProperty('active');
  });

  it('rejeita catálogo sem active em vez de tratar paciente como ativo por omissão', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond([{ ...appointment.patient, email: 'ana.souza@drlaudo.test' }]));
    await expect(staffStore().dispatch(api.endpoints.getPatients.initiate()).unwrap()).rejects.toMatchObject({ status: 500, data: internalError });
  });
  it('erro HTTP inválido torna-se falha interna segura', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ stack: 'SENTINELA-STACK' }, 500));
    await expect(staffStore().dispatch(api.endpoints.getPatients.initiate()).unwrap()).rejects.toMatchObject({ status: 500, data: internalError });
  });
  it('preserva envelope canônico e Retry-After do limite de login', async () => {
    const data = { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas de login. Tente novamente em instantes.' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(data, 429, { 'Retry-After': '37' }));
    await expect(staffStore().dispatch(api.endpoints.login.initiate({ email: 'ana.souza@drlaudo.test', password: 'x' })).unwrap()).rejects.toMatchObject({ status: 429, data, retryAfter: 37 });
  });
  it('401 no login não expira uma sessão nem cria aviso falso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(unauthorized, 401));
    const store = staffStore();
    await store.dispatch(api.endpoints.login.initiate({ email: 'ana.souza@drlaudo.test', password: 'x' }));
    expect(store.getState().auth.status).toBe('authenticated');
    expect(store.getState().auth.notice).toBeNull();
  });
  it('401 autenticado limpa sessão, persistência e dados privados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(unauthorized, 401));
    const store = staffStore();
    await store.dispatch(api.endpoints.getPatients.initiate());
    expect(store.getState().auth.session).toBeNull();
    expect(store.getState().auth.notice).toBe('Sua sessão expirou. Entre novamente.');
    expect(localStorage.getItem('drlaudo.session')).toBeNull();
    expect(Object.values(store.getState().api.queries).some((query) => query?.data)).toBe(false);
  });
  it('falha de rede não repete mutação nem perde a sessão', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const store = staffStore();
    await expect(store.dispatch(api.endpoints.publishReport.initiate(report.id)).unwrap()).rejects.toMatchObject({ status: 'FETCH_ERROR', data: internalError });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.status).toBe('authenticated');
  });
  it('cancelamento e publicação não enviam corpo JSON vazio', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(respond({ ...appointment, status: 'CANCELED' })).mockResolvedValueOnce(respond({ ...report, status: 'PUBLISHED', publishedAt: report.updatedAt }));
    const store = staffStore();
    await store.dispatch(api.endpoints.cancelAppointment.initiate(appointment.id)).unwrap();
    await store.dispatch(api.endpoints.publishReport.initiate(report.id)).unwrap();
    for (const [, options] of fetch.mock.calls) {
      expect(options?.method).toBe('POST');
      expect(options?.body).toBeUndefined();
      expect(new Headers(options?.headers).has('Content-Type')).toBe(false);
    }
  });
  it('normaliza entrada de login pelo schema compartilhado', async () => {
    const session = makeSession('STAFF');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(session));
    const store = staffStore();
    await store.dispatch(api.endpoints.login.initiate({ email: ' EQUIPE@DRLAUDO.TEST ', password: ' literal ' })).unwrap();
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ email: 'equipe@drlaudo.test', password: ' literal ' }));
  });
  it('rejeita entrada inválida antes de uma requisição', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(staffStore().dispatch(api.endpoints.getSlots.initiate({ date: '2026-02-30' })).unwrap()).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('descarta resposta tardia após troca de identidade mesmo se fetch ignorar abort', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(promise);
    const store = staffStore();
    const previousGeneration = store.getState().auth.generation;
    const request = store.dispatch(api.endpoints.getAppointments.initiate({}));
    store.dispatch(setSession(makeSession('PATIENT')));
    resolve(respond([appointment]));
    await request;
    await Promise.resolve();
    expect(store.getState().auth.generation).toBeGreaterThan(previousGeneration);
    expect(store.getState().auth.session?.user.role).toBe('PATIENT');
    expect(JSON.stringify(store.getState().api)).not.toContain(appointment.patient.name);
  });
  it('criar agendamento refaz a lista assinada, sem polling', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(respond([])).mockResolvedValueOnce(respond(appointment, 201)).mockResolvedValue(respond([appointment]));
    const store = staffStore();
    const list = store.dispatch(api.endpoints.getAppointments.initiate({}));
    await list.unwrap();
    await store.dispatch(api.endpoints.createAppointment.initiate({ patientId: appointment.patient.id, examTypeId: appointment.examType.id, startsAt: appointment.startsAt })).unwrap();
    await vi.waitFor(() => expect(api.endpoints.getAppointments.select({})(store.getState()).data).toEqual([appointment]));
    expect(fetch).toHaveBeenCalledTimes(3);
    list.unsubscribe();
  });
  it('publicação refaz laudo, agendamento e histórico próprio assinados', async () => {
    const published = { ...report, status: 'PUBLISHED', publishedAt: report.updatedAt };
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push(String(url));
      if (init?.method === 'POST') return respond(published);
      if (String(url).endsWith('/me/appointments')) return respond([]);
      if (String(url).endsWith('/report')) return respond(report);
      return respond(appointment);
    });
    const store = staffStore();
    const subscriptions = [store.dispatch(api.endpoints.getAppointment.initiate(appointment.id)), store.dispatch(api.endpoints.getReport.initiate(appointment.id)), store.dispatch(api.endpoints.getMyAppointments.initiate())];
    await Promise.all(subscriptions.map((subscription) => subscription.unwrap()));
    await store.dispatch(api.endpoints.publishReport.initiate(report.id)).unwrap();
    await vi.waitFor(() => expect(calls).toHaveLength(7));
    for (const subscription of subscriptions) subscription.unsubscribe();
  });
  it('cada store escuta eventos DOM e pode liberar listeners sem afetar outro store vivo', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => respond(patientReport));
    const first = staffStore();
    const second = staffStore();
    const subscriptions = [first, second].map((store) => store.dispatch(api.endpoints.getMyReport.initiate(appointment.id)));
    await Promise.all(subscriptions.map((subscription) => subscription.unwrap()));
    expect(fetch).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(api.endpoints.getMyReport.select(appointment.id)(second.getState()).status).toBe('fulfilled'));
    expect('dispose' in first && typeof first.dispose === 'function').toBe(true);
    if ('dispose' in first && typeof first.dispose === 'function') first.dispose();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(api.endpoints.getMyReport.select(appointment.id)(first.getState()).data).toBeUndefined();
    expect(api.endpoints.getMyReport.select(appointment.id)(second.getState()).data).toEqual(patientReport);
    for (const subscription of subscriptions) subscription.unsubscribe();
  });
  it.each(['focus', 'online'] as const)('refaz leitura assinada ao receber evento DOM %s', async (event) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => respond(patientReport));
    const store = staffStore();
    const subscription = store.dispatch(api.endpoints.getMyReport.initiate(appointment.id));
    await subscription.unwrap();
    window.dispatchEvent(new Event(event));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    subscription.unsubscribe();
  });
});
