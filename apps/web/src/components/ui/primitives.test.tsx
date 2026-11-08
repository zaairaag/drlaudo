import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';

afterEach(cleanup);

describe('S6 · primitivas de interação', () => {
  it('um botão de navegação visual preserva semântica e foco do filho', () => {
    render(<Button asChild variant="outline"><a href="/agenda">Voltar para agenda</a></Button>);
    expect(screen.getByRole('link', { name: 'Voltar para agenda' })).toHaveAttribute('href', '/agenda');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('um botão desabilitado não dispara ação', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Agendar exame</Button>);
    await user.click(screen.getByRole('button', { name: 'Agendar exame' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('um diálogo possui nome, descrição e devolve foco ao fechar por Escape', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild><Button>Ver detalhes</Button></DialogTrigger>
        <DialogContent>
          <DialogTitle>Detalhes do exame</DialogTitle>
          <DialogDescription>Revise as informações antes de continuar.</DialogDescription>
          <Button>Voltar</Button>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Ver detalhes' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Detalhes do exame' })).toHaveAccessibleDescription('Revise as informações antes de continuar.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
