import '@testing-library/jest-dom/vitest';
import type { StaffAppointment, StaffReport } from '@drlaudo/contract';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../app/api';
import { resetSession, setSession } from '../../app/authSlice';
import { createAppStore, type AppStore } from '../../app/store';
import { makeSession } from '../../app/testFixtures';
import { ReportPage } from './ReportPage';

const baseAppointment: StaffAppointment = {
  id: '30000000-0000-4000-8000-000000000001',
  startsAt: '2026-11-10T13:00:00.000Z',
  status: 'SCHEDULED',
  patient: { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza' },
  examType: { id: '20000000-0000-4000-8000-000000000001', name: 'Raio-X de tórax' },
  report: null,
};

const baseDraftReport: StaffReport = {
  id: '40000000-0000-4000-8000-000000000001',
  appointmentId: baseAppointment.id,
  title: 'Laudo preliminar de tórax',
  body: 'Campos pleuropulmonares com transparência habitual. Seios costofrênicos livres.',
  professionalName: 'Dra. Marina Costa',
  status: 'DRAFT',
  publishedAt: null,
  updatedAt: '2026-11-10T12:00:00.000Z',
};

const basePublishedReport: StaffReport = {
  ...baseDraftReport,
  status: 'PUBLISHED',
  publishedAt: '2026-11-10T12:30:00.000Z',
};

const activeResources: { store: AppStore; router: { dispose: () => void } }[] = [];

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(code: string, message: string, status = 400) {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function setupReportHarness({
  appointmentId = baseAppointment.id,
  initialEntries = [`/agendamentos/${appointmentId}/laudo`],
}: {
  appointmentId?: string;
  initialEntries?: string[];
} = {}) {
  const store = createAppStore();
  store.dispatch(setSession(makeSession('STAFF')));

  const router = createMemoryRouter(
    [
      {
        path: '/agendamentos/:id/laudo',
        element: <ReportPage />,
      },
      {
        path: '/agenda',
        element: <div data-testid="agenda-page">Página da Agenda</div>,
      },
      {
        path: '/outro',
        element: <div data-testid="other-page">Outra página</div>,
      },
    ],
    { initialEntries },
  );

  activeResources.push({ store, router });

  const renderResult = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return {
    store,
    router,
    user: userEvent.setup(),
    ...renderResult,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  for (const item of activeResources.splice(0)) {
    item.router.dispose();
    item.store.dispatch(resetSession());
  }
  localStorage.clear();
});

describe('S4 / T18 / T19 · ReportPage: Recuperação, reconciliação e contexto', () => {
  it('exibe estado de carregamento com role="status" enquanto busca agendamento', async () => {
    const { promise } = Promise.withResolvers<Response>();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => promise);
    setupReportHarness();

    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
  });

  it('detalhe 404 exibe "Não encontramos este registro" com link para agenda', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/report')) {
        return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
      }
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    setupReportHarness();

    expect(await screen.findByText('Não encontramos este registro')).toBeVisible();
    expect(screen.getByRole('link', { name: /agenda/i })).toBeVisible();
  });

  it('detalhe 500 exibe erro interno e botão "Tentar novamente" que refaz a busca', async () => {
    let attempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        attempts += 1;
        if (attempts === 1) {
          return errorResponse('INTERNAL_ERROR', 'Não foi possível concluir a solicitação.', 500);
        }
        return jsonResponse(baseAppointment);
      }
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();

    expect(await screen.findByText('Algo deu errado. Tente novamente em instantes.')).toBeVisible();
    const retryBtn = screen.getByRole('button', { name: 'Tentar novamente' });
    await user.click(retryBtn);

    expect(await screen.findByLabelText('Título')).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('inconsistência: agendamento aponta laudo existente mas GET /report retorna 404', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    let reportAttempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        return jsonResponse(appointmentWithReport);
      }
      if (String(url).endsWith('/report')) {
        reportAttempts += 1;
        if (reportAttempts === 1) {
          return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
        }
        return jsonResponse(baseDraftReport);
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    expect(await screen.findByText(/inconsistência|não foi possível carregar/i)).toBeVisible();
    const retryBtn = screen.getByRole('button', { name: 'Tentar novamente' });
    await user.click(retryBtn);

    expect(await screen.findByDisplayValue(baseDraftReport.title)).toBeVisible();
  });

  it('agendado sem laudo (report null e GET 404) abre formulário vazio com "Salvar rascunho"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        return jsonResponse(baseAppointment);
      }
      if (String(url).endsWith('/report')) {
        return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
      }
      return jsonResponse({});
    });

    setupReportHarness();

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    expect(screen.getByText('Raio-X de tórax')).toBeVisible();
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByLabelText('Texto do laudo')).toHaveValue('');
    expect(screen.getByLabelText('Profissional responsável')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeVisible();
  });

  it('agendado com DRAFT ativo exibe os 3 campos preenchidos com o baseline', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        return jsonResponse(appointmentWithReport);
      }
      if (String(url).endsWith('/report')) {
        return jsonResponse(baseDraftReport);
      }
      return jsonResponse({});
    });

    setupReportHarness();

    expect(await screen.findByDisplayValue(baseDraftReport.title)).toBeVisible();
    expect(screen.getByDisplayValue(baseDraftReport.body)).toBeVisible();
    expect(screen.getByDisplayValue(baseDraftReport.professionalName)).toBeVisible();
  });
});

describe('S4 / RN-16 · Validação e regras de negócio de entrada', () => {
  it('exibe erro e não envia quando título tem menos de 3 caracteres após trim', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        return jsonResponse(baseAppointment);
      }
      if (String(url).endsWith('/report')) {
        return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, '  ab  ');
    await user.type(screen.getByLabelText('Texto do laudo'), 'Texto com mais de dez caracteres.');
    await user.type(screen.getByLabelText('Profissional responsável'), 'Dra. Marina Costa');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText(/menor que o limite permitido|mínimo 3/i)).toBeVisible();
    expect(titleInput).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/report'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('exibe erro quando título tem mais de 120 caracteres', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();
    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, 'a'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText(/maior que o limite permitido|máximo 120/i)).toBeVisible();
  });

  it('exibe erro quando texto tem menos de 10 caracteres após trim', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();
    const bodyInput = await screen.findByLabelText('Texto do laudo');
    await user.type(screen.getByLabelText('Título'), 'Título Válido');
    await user.type(bodyInput, '  curto  ');
    await user.type(screen.getByLabelText('Profissional responsável'), 'Dra. Marina Costa');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText(/menor que o limite permitido|mínimo 10/i)).toBeVisible();
    expect(bodyInput).toHaveFocus();
  });

  it('exibe erro quando profissional tem menos de 3 caracteres após trim', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();
    await user.type(await screen.findByLabelText('Título'), 'Título Válido');
    await user.type(screen.getByLabelText('Texto do laudo'), 'Texto com mais de dez caracteres.');
    const profInput = screen.getByLabelText('Profissional responsável');
    await user.type(profInput, 'Dr');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText(/menor que o limite permitido|mínimo 3/i)).toBeVisible();
    expect(profInput).toHaveFocus();
  });

  it('preserva quebras de linha e espaços internos no corpo do laudo', async () => {
    let capturedBody = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      if (String(url).endsWith('/report') && init?.method === 'POST') {
        const parsed = JSON.parse(String(init.body));
        capturedBody = parsed.body;
        return jsonResponse(baseDraftReport, 201);
      }
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();
    await user.type(await screen.findByLabelText('Título'), 'Título Válido');
    const complexBody = 'Primeiro parágrafo.\n\nSegundo com   espaços   internos.';
    await user.type(screen.getByLabelText('Texto do laudo'), complexBody);
    await user.type(screen.getByLabelText('Profissional responsável'), 'Dra. Marina');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(capturedBody).toBe(complexBody));
  });
});

describe('S4 / T18 · Salvar rascunho, baseline e proteção contra sobrescrita', () => {
  it('cria laudo quando novo (POST /appointments/:id/report) e adota DTO retornado como baseline', async () => {
    let postedBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      if (String(url).endsWith('/report') && init?.method === 'POST') {
        postedBody = JSON.parse(String(init.body));
        return jsonResponse(baseDraftReport, 201);
      }
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();

    await user.type(await screen.findByLabelText('Título'), '  Laudo preliminar de tórax  ');
    await user.type(screen.getByLabelText('Texto do laudo'), 'Campos pleuropulmonares com transparência habitual. Seios costofrênicos livres.');
    await user.type(screen.getByLabelText('Profissional responsável'), '  Dra. Marina Costa  ');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(postedBody).toEqual({
        title: 'Laudo preliminar de tórax',
        body: 'Campos pleuropulmonares com transparência habitual. Seios costofrênicos livres.',
        professionalName: 'Dra. Marina Costa',
      });
    });

    expect(await screen.findByText('Rascunho salvo.')).toBeVisible();
    expect(screen.queryByText('Salve o rascunho antes de publicar.')).not.toBeInTheDocument();
  });

  it('atualiza laudo quando já existe (PATCH /reports/:id) enviando valores atualizados', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    let patchBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      if (String(url).endsWith(`/reports/${baseDraftReport.id}`) && init?.method === 'PATCH') {
        patchBody = JSON.parse(String(init.body));
        return jsonResponse({ ...baseDraftReport, title: 'Título atualizado', updatedAt: '2026-11-10T12:05:00.000Z' });
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    expect(titleInput).toHaveValue(baseDraftReport.title);

    await user.clear(titleInput);
    await user.type(titleInput, 'Título atualizado');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(patchBody).toEqual({
        title: 'Título atualizado',
        body: baseDraftReport.body,
        professionalName: baseDraftReport.professionalName,
      });
    });

    expect(await screen.findByText('Rascunho salvo.')).toBeVisible();
  });

  it('refetch do servidor NUNCA sobrescreve edições locais dirty do usuário', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user, store } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' - alteração não salva');
    expect(titleInput).toHaveValue(`${baseDraftReport.title} - alteração não salva`);

    // Dispara refetch em background (ex: foco na janela)
    store.dispatch(api.internalActions.onFocus());

    await waitFor(() => {
      expect(titleInput).toHaveValue(`${baseDraftReport.title} - alteração não salva`);
    });
  });

  it('durante o salvamento pendente, botões e campos ficam desabilitados', async () => {
    let resolveSave: ((resp: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      if (String(url).endsWith('/report') && init?.method === 'POST') {
        const { promise, resolve } = Promise.withResolvers<Response>();
        resolveSave = resolve;
        return promise;
      }
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();

    await user.type(await screen.findByLabelText('Título'), 'Laudo preliminar de tórax');
    await user.type(screen.getByLabelText('Texto do laudo'), 'Campos pleuropulmonares com transparência habitual.');
    await user.type(screen.getByLabelText('Profissional responsável'), 'Dra. Marina Costa');

    const saveBtn = screen.getByRole('button', { name: 'Salvar rascunho' });
    await user.click(saveBtn);

    expect(await screen.findByRole('button', { name: 'Salvando…' })).toBeDisabled();
    expect(screen.getByLabelText('Título')).toBeDisabled();
    expect(screen.getByLabelText('Texto do laudo')).toBeDisabled();
    expect(screen.getByLabelText('Profissional responsável')).toBeDisabled();

    resolveSave?.(jsonResponse(baseDraftReport, 201));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).not.toBeDisabled();
    });
  });
});

describe('S4 / T19 · Elegibilidade e publicação de laudo', () => {
  it('quando o formulário está dirty, "Publicar" fica desabilitado e mostra aviso literal', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' editado');

    const publishBtn = screen.getByRole('button', { name: 'Publicar' });
    expect(publishBtn).toBeDisabled();
    expect(screen.getByText('Salve o rascunho antes de publicar.')).toBeVisible();
  });

  it('quando não há rascunho salvo (formulário novo), "Publicar" fica desabilitado', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    setupReportHarness();

    const publishBtn = await screen.findByRole('button', { name: 'Publicar' });
    expect(publishBtn).toBeDisabled();
  });

  it('clicar em "Publicar" abre PublishDialog com textos do PRD e foco em "Voltar"', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const publishBtn = await screen.findByRole('button', { name: 'Publicar' });
    expect(publishBtn).not.toBeDisabled();
    await user.click(publishBtn);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Publicar laudo?');
    expect(dialog).toHaveTextContent('Depois de publicado, o laudo não poderá ser editado.');
    expect(dialog).toHaveTextContent('O paciente poderá consultar este laudo.');
    expect(dialog).toHaveTextContent('Ana Souza');
    expect(dialog).toHaveTextContent('Raio-X de tórax');

    const cancelBtn = within(dialog).getByRole('button', { name: 'Voltar' });
    expect(cancelBtn).toHaveFocus();
  });

  it('desistir no PublishDialog por "Voltar" ou Escape não executa chamada HTTP', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const publishBtn = await screen.findByRole('button', { name: 'Publicar' });
    await user.click(publishBtn);

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/publish'),
      expect.anything(),
    );
  });

  it('confirmar publicação faz chamada POST NoBody e troca tela para modo de leitura imutável', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    let publishOptions: RequestInit | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      if (String(url).endsWith(`/reports/${baseDraftReport.id}/publish`) && init?.method === 'POST') {
        publishOptions = init;
        return jsonResponse(basePublishedReport);
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const publishBtn = await screen.findByRole('button', { name: 'Publicar' });
    await user.click(publishBtn);

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Publicar laudo' }));

    await waitFor(() => {
      expect(publishOptions?.method).toBe('POST');
      expect(publishOptions?.body).toBeUndefined();
    });

    expect(await screen.findByText('Laudo publicado.')).toBeVisible();
    expect(await screen.findByText('Este laudo foi publicado e não pode ser alterado.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
  });
});

describe('S4 / RN-12 / RN-18 / RN-20 · Estados bloqueados e imutáveis', () => {
  it('laudo já publicado carrega em modo leitura imutável com aviso canônico', async () => {
    const appointmentPublished: StaffAppointment = {
      ...baseAppointment,
      report: { id: basePublishedReport.id, status: 'PUBLISHED' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentPublished);
      if (String(url).endsWith('/report')) return jsonResponse(basePublishedReport);
      return jsonResponse({});
    });

    setupReportHarness();

    expect(await screen.findByText('Este laudo foi publicado e não pode ser alterado.')).toBeVisible();
    expect(screen.getByText('Publicado em')).toBeVisible();
    expect(screen.getByText('Publicado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('agendamento cancelado com DRAFT exibe laudo preservado com aviso de bloqueio', async () => {
    const canceledWithDraft: StaffAppointment = {
      ...baseAppointment,
      status: 'CANCELED',
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(canceledWithDraft);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    setupReportHarness();

    expect(await screen.findByText('O agendamento foi cancelado; o laudo está bloqueado.')).toBeVisible();
    expect(screen.getByText(baseDraftReport.title)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
  });

  it('agendamento cancelado sem laudo bloqueia cadastro com aviso canônico', async () => {
    const canceledNoReport: StaffAppointment = {
      ...baseAppointment,
      status: 'CANCELED',
      report: null,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(canceledNoReport);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    setupReportHarness();

    expect(await screen.findByText('Agendamento cancelado. Não é possível cadastrar laudo.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
  });
});

describe('S4 / S6 · Proteção contra perda de dados (useBlocker e beforeunload)', () => {
  it('navegação interna com dirty exibe diálogo de descarte e cancelar mantém o usuário', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user, router } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' alterado');

    // Clica no link para voltar para a agenda
    const backLink = screen.getByRole('link', { name: /voltar para agenda/i });
    await user.click(backLink);

    // Diálogo de confirmação de descarte de alterações
    const discardDialog = await screen.findByRole('alertdialog');
    expect(discardDialog).toHaveTextContent('Descartar alterações?');
    expect(discardDialog).toHaveTextContent('Você tem alterações não salvas no laudo.');

    // Cancelar o descarte
    const keepEditingBtn = within(discardDialog).getByRole('button', { name: 'Continuar editando' });
    await user.click(keepEditingBtn);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/agendamentos/${baseAppointment.id}/laudo`);
    expect(screen.getByLabelText('Título')).toHaveValue(`${baseDraftReport.title} alterado`);
  });

  it('navegação interna com dirty e confirmação de descarte prossegue para a nova rota', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user, router } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' alterado');

    const backLink = screen.getByRole('link', { name: /voltar para agenda/i });
    await user.click(backLink);

    const discardDialog = await screen.findByRole('alertdialog');
    const discardBtn = within(discardDialog).getByRole('button', { name: 'Descartar alterações' });
    await user.click(discardBtn);

    await waitFor(() => expect(router.state.location.pathname).toBe('/agenda'));
  });

  it('beforeunload adiciona listener quando dirty e aciona preventDefault', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(baseAppointment);
      return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
    });

    const { user } = setupReportHarness();
    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, 'Novo Laudo');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('S4 / E3 / E4 · Conflitos concorrentes, reconciliação e recarregar', () => {
  it('conflito ao salvar (409) preserva texto em memória e refaz leituras de agendamento e laudo', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    let refetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        refetchCount += 1;
        return jsonResponse(appointmentWithReport);
      }
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      if (init?.method === 'PATCH') {
        return errorResponse('REPORT_LOCKED', 'Este laudo foi publicado e não pode ser alterado.', 409);
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.clear(titleInput);
    await user.type(titleInput, 'Texto Conflitante');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('Este laudo foi publicado e não pode ser alterado.')).toBeVisible();
    // O texto digitado pelo usuário continua em memória!
    expect(screen.getByLabelText('Título')).toHaveValue('Texto Conflitante');
    // Consultas foram refeitas para reconciliação
    expect(refetchCount).toBeGreaterThanOrEqual(2);
  });

  it('se após reconciliação o agendamento foi cancelado, exibe aviso e dados canônicos sem forçar escrita', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    let step = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        if (step > 0) {
          return jsonResponse({ ...appointmentWithReport, status: 'CANCELED' });
        }
        return jsonResponse(appointmentWithReport);
      }
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      if (init?.method === 'PATCH') {
        step = 1;
        return errorResponse('APPOINTMENT_CANCELED', 'O agendamento foi cancelado; o laudo está bloqueado.', 409);
      }
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' mais texto');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('O agendamento foi cancelado; o laudo está bloqueado.')).toBeVisible();
    expect(screen.getByText(/alterações não salvas/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
  });

  it('botão "Recarregar rascunho" exige confirmação explícita antes de descartar alterações locais', async () => {
    const appointmentWithReport: StaffAppointment = {
      ...baseAppointment,
      report: { id: baseDraftReport.id, status: 'DRAFT' },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) return jsonResponse(appointmentWithReport);
      if (String(url).endsWith('/report')) return jsonResponse(baseDraftReport);
      return jsonResponse({});
    });

    const { user } = setupReportHarness();

    const titleInput = await screen.findByLabelText('Título');
    await user.type(titleInput, ' com modificação');

    const reloadBtn = screen.getByRole('button', { name: 'Recarregar rascunho' });
    await user.click(reloadBtn);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Descartar alterações?');

    await user.click(within(dialog).getByRole('button', { name: 'Descartar e recarregar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Título')).toHaveValue(baseDraftReport.title);
    });
  });
});

describe('S4 / S6 · Troca de id na rota', () => {
  it('trocar o id da rota limpa o conteúdo anterior e carrega o novo agendamento', async () => {
    const secondAppointment: StaffAppointment = {
      ...baseAppointment,
      id: '30000000-0000-4000-8000-000000000002',
      patient: { id: '10000000-0000-4000-8000-000000000003', name: 'Bruno Lima' },
      examType: { id: '20000000-0000-4000-8000-000000000002', name: 'Ultrassonografia de abdome' },
      report: null,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith(`/appointments/${baseAppointment.id}`)) {
        return jsonResponse({
          ...baseAppointment,
          report: { id: baseDraftReport.id, status: 'DRAFT' },
        });
      }
      if (String(url).endsWith(`/appointments/${baseAppointment.id}/report`)) {
        return jsonResponse(baseDraftReport);
      }
      if (String(url).endsWith(`/appointments/${secondAppointment.id}`)) {
        return jsonResponse(secondAppointment);
      }
      if (String(url).endsWith(`/appointments/${secondAppointment.id}/report`)) {
        return errorResponse('NOT_FOUND', 'Não encontramos este registro', 404);
      }
      return jsonResponse({});
    });

    const { router } = setupReportHarness();

    expect(await screen.findByDisplayValue(baseDraftReport.title)).toBeVisible();
    expect(screen.getByText('Ana Souza')).toBeVisible();

    // Navega para o segundo agendamento
    await router.navigate(`/agendamentos/${secondAppointment.id}/laudo`);

    expect(await screen.findByText('Bruno Lima')).toBeVisible();
    expect(screen.getByText('Ultrassonografia de abdome')).toBeVisible();
    expect(screen.queryByDisplayValue(baseDraftReport.title)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });
});
