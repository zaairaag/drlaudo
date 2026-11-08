import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

describe('S6 · status com texto e ícone', () => {
  it.each([
    ['SCHEDULED', 'Agendado'],
    ['CANCELED', 'Cancelado'],
    ['DRAFT', 'Rascunho'],
    ['PUBLISHED', 'Publicado'],
    ['REPORT_AVAILABLE', 'Laudo disponível'],
  ] as const)('apresenta %s sem depender da cor', (status, label) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('nunca revela um rascunho em modo paciente', () => {
    const { container } = render(<StatusBadge status="DRAFT" patient />);
    expect(container).toBeEmptyDOMElement();
  });

  it('troca o rótulo de publicação pelo rótulo do portal no modo paciente', () => {
    render(<StatusBadge status="PUBLISHED" patient />);
    expect(screen.getByText('Laudo disponível')).toBeVisible();
    expect(screen.queryByText('Publicado')).not.toBeInTheDocument();
  });
});
