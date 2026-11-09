import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { setSession } from '../../app/authSlice';
import { createAppStore, type AppStore } from '../../app/store';
import { makeSession } from '../../app/testFixtures';
import { MyAppointmentsPage } from './MyAppointmentsPage';
import { PatientReportPage } from './PatientReportPage';

const resources: { store: AppStore; router: { dispose: () => void } }[] = [];
afterEach(() => {
  cleanup();
  for (const { store, router } of resources.splice(0)) { router.dispose(); store.dispose(); }
  localStorage.clear();
  vi.restoreAllMocks();
});

const anaSession = makeSession('PATIENT');
const anaAppointments = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    startsAt: '2026-11-10T11:00:00.000Z',
    status: 'SCHEDULED' as const,
    examType: { id: '20000000-0000-4000-8000-000000000001', name: 'Raio-X de tórax' },
    hasPublishedReport: true,
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    startsAt: '2026-11-10T12:00:00.000Z',
    status: 'SCHEDULED' as const,
    examType: { id: '20000000-0000-4000-8000-000000000002', name: 'Ultrassonografia de abdome' },
    hasPublishedReport: false,
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    startsAt: '2026-11-10T15:00:00.000Z',
    status: 'CANCELED' as const,
    examType: { id: '20000000-0000-4000-8000-000000000002', name: 'Ultrassonografia de abdome' },
    hasPublishedReport: false,
  },
];

const publishedReportAna = {
  title: 'Laudo de Raio-X de tórax',
  body: 'Pulmões com transparência preservada. Seios costofrênicos livres.\n\nSem lesões ativas.',
  professionalName: 'Dra. Marina Costa',
  publishedAt: '2026-11-10T09:30:00.000Z',
  examType: { name: 'Raio-X de tórax' },
  startsAt: '2026-11-10T11:00:00.000Z',
};

function renderPatientPortal(initialPath = '/meus-exames', session = anaSession) {
  const store = createAppStore();
  store.dispatch(setSession(session));

  const router = createMemoryRouter(
    [
      { path: '/meus-exames', element: <MyAppointmentsPage /> },
      { path: '/meus-exames/:id/laudo', element: <PatientReportPage /> },
    ],
    { initialEntries: [initialPath] },
  );
  resources.push({ store, router });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { store, router, user: userEvent.setup() };
}

describe('S5 / T20 · Portal do Paciente: Lista e visualização sem indício de rascunho', () => {
  it('lista histórico completo com exames agendados e cancelados na ordem retornada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(anaAppointments, { headers: { 'Content-Type': 'application/json' } }));
    renderPatientPortal('/meus-exames');

    expect(await screen.findByRole('heading', { name: 'Meus exames' })).toBeVisible();
    expect(screen.getByText('Horário de Brasília')).toBeVisible();

    const articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(3);

    // Primeiro item: Agendado com laudo publicado
    expect(articles[0]).toHaveTextContent('Raio-X de tórax');
    expect(articles[0]).toHaveTextContent('Agendado');
    expect(articles[0]).toHaveTextContent('Laudo disponível');
    expect(articles[0]).toHaveTextContent('Ver laudo');

    // Segundo item: Agendado sem laudo (ou com DRAFT interno) - ZERO menção a rascunho
    expect(articles[1]).toHaveTextContent('Ultrassonografia de abdome');
    expect(articles[1]).toHaveTextContent('Agendado');
    expect(articles[1]).not.toHaveTextContent('Laudo disponível');
    expect(articles[1]).not.toHaveTextContent('Ver laudo');
    expect(articles[1]).not.toHaveTextContent('Rascunho');
    expect(articles[1]).not.toHaveTextContent('DRAFT');

    // Terceiro item: Cancelado
    expect(articles[2]).toHaveTextContent('Cancelado');
    expect(articles[2]).not.toHaveTextContent('Ver laudo');
  });

  it('agrupa por mês de Brasília, sem mover horário UTC do fim do mês para o mês seguinte', async () => {
    const november = anaAppointments[0];
    const december = anaAppointments[1];
    if (!november || !december) throw new Error('Fixtures ausentes');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([
      { ...november, startsAt: '2026-12-01T01:00:00.000Z' },
      { ...december, startsAt: '2026-12-01T10:00:00.000Z' },
    ]));
    renderPatientPortal();
    const novemberGroup = await screen.findByRole('region', { name: 'Novembro de 2026' });
    const decemberGroup = screen.getByRole('region', { name: 'Dezembro de 2026' });
    expect(within(novemberGroup).getByRole('article')).toHaveTextContent('30/11/2026 às 22:00');
    expect(within(novemberGroup).getByRole('link', { name: /Ver laudo/ })).toHaveAttribute('href', `/meus-exames/${november.id}/laudo`);
    expect(within(decemberGroup).getByRole('article')).toHaveTextContent('01/12/2026 às 07:00');
    expect(within(decemberGroup).queryByRole('link')).not.toBeInTheDocument();
    expect(decemberGroup).not.toHaveTextContent(/rascunho|draft/i);
  });

  it('se a lista de exames estiver vazia, exibe EmptyState canônico', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([], { headers: { 'Content-Type': 'application/json' } }));
    renderPatientPortal('/meus-exames');

    expect(await screen.findByText('Você ainda não tem exames agendados.')).toBeVisible();
  });

  it('se a lista de exames falhar por erro de rede ou 500, oferece botão de tentar novamente', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Erro' } }, { status: 500, headers: { 'Content-Type': 'application/json' } }),
    );
    renderPatientPortal('/meus-exames');

    expect(await screen.findByText('Não foi possível carregar seus exames.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });

  it('exibe laudo publicado com ReportViewer formatado em folha clínica e horário de Brasília', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(publishedReportAna, { headers: { 'Content-Type': 'application/json' } }));
    renderPatientPortal('/meus-exames/30000000-0000-4000-8000-000000000001/laudo');

    expect(await screen.findByRole('heading', { name: 'Laudo de Raio-X de tórax' })).toBeVisible();
    expect(screen.getByText('Dra. Marina Costa')).toBeVisible();
    expect(screen.getByText(/Sem lesões ativas\./)).toBeVisible();
    expect(screen.getByRole('link', { name: /Voltar para meus exames/i })).toBeVisible();
  });

  it('quatro casos opacos (404 alheio, inexistente, próprio sem laudo, próprio em rascunho) exibem a mesma tela', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' } }, { status: 404, headers: { 'Content-Type': 'application/json' } }),
    );
    renderPatientPortal('/meus-exames/30000000-0000-4000-8000-000000000002/laudo');

    expect(await screen.findByText('Não encontramos este registro')).toBeVisible();
    expect(screen.getByText('O exame solicitado não possui um laudo publicado ou não pertence ao seu histórico.')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Voltar para meus exames' })).toHaveLength(2);

    // Sem nenhum vazamento de ID, DRAFT ou dados clínicos
    expect(screen.queryByText(/Rascunho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DRAFT/i)).not.toBeInTheDocument();
  });
});
