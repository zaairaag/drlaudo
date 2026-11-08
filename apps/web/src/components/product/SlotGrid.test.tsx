import '@testing-library/jest-dom/vitest';
import type { SlotsResponse } from '@drlaudo/contract';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotGrid } from './SlotGrid';

afterEach(cleanup);

const slots: SlotsResponse['slots'] = [
  { startsAt: '2026-11-09T10:00:00.000Z', available: false, reason: 'PAST' },
  { startsAt: '2026-11-09T13:00:00.000Z', available: true },
  { startsAt: '2026-11-09T13:30:00.000Z', available: false, reason: 'TAKEN' },
  { startsAt: '2026-11-09T14:00:00.000Z', available: true },
];

function ControlledGrid() {
  const [value, setValue] = useState('');
  return <SlotGrid slots={slots} value={value} onChange={setValue} />;
}

describe('S3/S6 · escolha de horário', () => {
  it('permite escolher um horário pelo teclado com estado de seleção explícito', async () => {
    const user = userEvent.setup();
    render(<ControlledGrid />);
    const available = screen.getByRole('button', { name: '10:00, disponível' });
    await user.tab();
    expect(available).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(available).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '11:00, disponível' }));
    expect(available).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '11:00, disponível' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('não seleciona ocupados ou passados e explica o motivo fora da cor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SlotGrid slots={slots} value="" onChange={onChange} />);
    const past = screen.getByRole('button', { name: '07:00, horário passado' });
    const taken = screen.getByRole('button', { name: '10:30, ocupado' });
    expect(past).toBeDisabled();
    expect(taken).toBeDisabled();
    expect(past).toHaveAccessibleDescription('Horário passado');
    expect(taken).toHaveAccessibleDescription('Ocupado');
    await user.click(past);
    await user.click(taken);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bloqueia toda a grade durante envio ou recarregamento', () => {
    render(<SlotGrid slots={slots} value="" onChange={vi.fn()} disabled />);
    for (const slot of screen.getAllByRole('button')) expect(slot).toBeDisabled();
  });

  it('apresenta a recuperação literal quando não há livres', () => {
    render(<SlotGrid slots={slots.filter((slot) => !slot.available)} value="" onChange={vi.fn()} />);
    expect(screen.getByText('Não há horários disponíveis nesta data. Escolha outra data.')).toBeVisible();
  });

  it('não conserva uma seleção acionável quando a disponibilidade muda', () => {
    const onChange = vi.fn();
    render(<SlotGrid slots={slots} value="2026-11-09T13:30:00.000Z" onChange={onChange} />);
    const taken = screen.getByRole('button', { name: '10:30, ocupado' });
    expect(taken).toHaveAttribute('aria-pressed', 'false');
    expect(taken).toBeDisabled();
  });
});
