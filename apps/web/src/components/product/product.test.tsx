import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';
import { TimezoneNote } from './TimezoneNote';

afterEach(cleanup);

describe('S6 · componentes de estrutura e contexto', () => {
  it('PageHeader apresenta título em h1 acessível e ações associadas', () => {
    render(
      <PageHeader
        title="Agenda de exames"
        description="Consulte os exames agendados para a data."
        actions={<button type="button">Novo agendamento</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda de exames' })).toBeVisible();
    expect(screen.getByText('Consulte os exames agendados para a data.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo agendamento' })).toBeVisible();
  });

  it('EmptyState renderiza mensagem com ação e semântica clara', () => {
    render(
      <EmptyState
        title="Nenhum agendamento para os filtros selecionados."
        description="Tente escolher outra data ou limpar o filtro."
        action={<button type="button">Limpar filtros</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Nenhum agendamento para os filtros selecionados.' })).toBeVisible();
    expect(screen.getByText('Tente escolher outra data ou limpar o filtro.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
  });

  it('TimezoneNote expõe a indicação normativa de horário de Brasília', () => {
    render(<TimezoneNote />);
    expect(screen.getByText('Horário de Brasília')).toBeVisible();
  });
});
