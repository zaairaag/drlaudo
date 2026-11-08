import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotGrid } from '../../components/product/SlotGrid';

afterEach(cleanup);

describe('S3.9 S3.10 S3.12: escolha explícita de horário', () => {
  const slots = [
    { startsAt: '2026-11-10T13:00:00.000Z', available: true as const },
    { startsAt: '2026-11-10T13:30:00.000Z', available: false as const, reason: 'TAKEN' as const },
    { startsAt: '2026-11-10T10:00:00.000Z', available: false as const, reason: 'PAST' as const },
  ];
  it('seleciona somente horário livre e apresenta nomes acessíveis de Brasília', async () => {
    const chosen: string[] = [];
    render(<SlotGrid slots={slots} onChange={(value) => chosen.push(value)} />);
    await userEvent.click(screen.getByRole('button', { name: '10:00, disponível' }));
    expect(chosen).toEqual(['2026-11-10T13:00:00.000Z']);
    expect(screen.getByRole('button', { name: '10:30, ocupado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '07:00, horário passado' })).toBeDisabled();
  });
  it('não permite escolher slot quando a grade está desabilitada', async () => {
    const chosen: string[] = [];
    render(<SlotGrid slots={slots} disabled onChange={(value) => chosen.push(value)} />);
    await userEvent.click(screen.getByRole('button', { name: '10:00, disponível' }));
    expect(chosen).toEqual([]);
  });
});
