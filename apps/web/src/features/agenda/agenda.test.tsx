import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StaffAppointment } from '@drlaudo/contract';
import { CancelDialog } from '../../components/product/CancelDialog';

afterEach(cleanup);
const appointment: StaffAppointment = {
  id: '30000000-0000-4000-8000-000000000001', startsAt: '2026-11-10T13:00:00.000Z', status: 'SCHEDULED',
  patient: { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza' },
  examType: { id: '20000000-0000-4000-8000-000000000001', name: 'Raio-X de tórax' }, report: null,
};

describe('S3.17 S3.18 S6.7 S6.8: cancelar exige confirmação', () => {
  it('abrir não cancela e apresenta contexto com opção segura em foco', async () => {
    let calls = 0;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { calls += 1; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    expect(calls).toBe(0);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cancelar este agendamento?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('O cancelamento é definitivo e o horário ficará disponível.');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Raio-X de tórax');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('10:00');
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus();
  });
  it.each(['Voltar', 'Escape'])('desistir por %s não envia e devolve foco ao gatilho', async (action) => {
    let calls = 0;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { calls += 1; }} />);
    const trigger = screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' });
    await userEvent.click(trigger);
    if (action === 'Escape') await userEvent.keyboard('{Escape}');
    else await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls).toBe(0);
    expect(trigger).toHaveFocus();
  });
  it('preserva aviso explícito de rascunho bloqueado', async () => {
    render(<CancelDialog appointment={{ ...appointment, report: { id: '40000000-0000-4000-8000-000000000001', status: 'DRAFT' } }} pending={false} onConfirm={async () => { throw new Error('Não deve enviar ao abrir.'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('O rascunho será preservado e ficará bloqueado.');
  });
  it('só confirmação explícita executa a operação e fecha', async () => {
    let canceled = false;
    render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { canceled = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    await userEvent.click(screen.getByRole('button', { name: /^Cancelar agendamento$/ }));
    expect(canceled).toBe(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
  it('envio pendente bloqueia cancelamento duplicado, desistência e Escape', async () => {
    const view = render(<CancelDialog appointment={appointment} pending={false} onConfirm={async () => { throw new Error('Não deve reenviar.'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Ana Souza' }));
    view.rerender(<CancelDialog appointment={appointment} pending onConfirm={async () => { throw new Error('Não deve reenviar.'); }} />);
    expect(screen.getByRole('button', { name: 'Cancelando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
