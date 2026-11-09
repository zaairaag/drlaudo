import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppStore, type AppStore } from '../../app/store';
import { setSession } from '../../app/authSlice';
import { makeSession } from '../../app/testFixtures';
import { AppShell } from './AppShell';

const stores: AppStore[] = [];
afterEach(() => {
  cleanup();
  for (const store of stores.splice(0)) store.dispose();
  localStorage.clear();
});

describe('S3/S6 · AppShell e navegação mobile/desktop', () => {
  it('apresenta rótulo compacto visual no mobile preservando o nome acessível completo e o link da marca', () => {
    const store = createAppStore();
    stores.push(store);
    store.dispatch(setSession(makeSession('STAFF')));

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/agenda']}>
          <AppShell />
        </MemoryRouter>
      </Provider>,
    );

    const logoLink = screen.getByRole('link', { name: /dr\. laudo/i });
    expect(logoLink).toBeVisible();
    expect(logoLink).toHaveAttribute('href', '/agenda');

    const novoAgendamentoLink = screen.getByRole('link', { name: 'Novo agendamento' });
    expect(novoAgendamentoLink).toBeVisible();
    expect(novoAgendamentoLink).toHaveAttribute('href', '/agendamentos/novo');
    expect(novoAgendamentoLink).toHaveTextContent('Agendar');
    expect(novoAgendamentoLink).toHaveTextContent('Novo agendamento');

    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
  });
});
