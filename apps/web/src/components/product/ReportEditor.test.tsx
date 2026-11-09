import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { appointment, report } from '../../app/testFixtures';
import { ReportEditor } from './ReportEditor';

afterEach(cleanup);

describe('S4 · estado acessível das ações do editor', () => {
  it('não anuncia rascunho salvo sem DTO e mantém a edição quando a gravação falha', async () => {
    const user = userEvent.setup();
    render(
      <ReportEditor
        appointment={appointment}
        report={null}
        isSaving={false}
        isPublishing={false}
        reconciling={false}
        onSave={async () => false}
        onPublishClick={() => { throw new Error('Não pode publicar sem rascunho salvo.'); }}
      />,
    );

    const actions = within(screen.getByRole('group', { name: 'Ações do laudo' }));
    expect(actions.getByRole('status')).toHaveTextContent('Rascunho ainda não salvo');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeDisabled();

    await user.type(screen.getByLabelText('Título'), 'Laudo em edição');
    await user.type(screen.getByLabelText('Texto do laudo'), 'Conteúdo que deve continuar no formulário.');
    await user.type(screen.getByLabelText('Profissional responsável'), 'Dra. Marina Costa');
    await user.click(actions.getByRole('button', { name: 'Salvar rascunho' }));

    expect(actions.getByRole('status')).toHaveTextContent('Alterações não salvas');
    expect(actions.getByRole('status')).toHaveTextContent('Salve o rascunho antes de publicar.');
    expect(actions.queryByText('Rascunho salvo no sistema')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Texto do laudo')).toHaveValue('Conteúdo que deve continuar no formulário.');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('só volta ao estado salvo após confirmar o descarte das alterações locais', async () => {
    const user = userEvent.setup();
    render(
      <ReportEditor
        appointment={appointment}
        report={report}
        isSaving={false}
        isPublishing={false}
        reconciling={false}
        onSave={async () => false}
        onPublishClick={() => { throw new Error('Publicação não faz parte deste cenário.'); }}
      />,
    );

    const actions = within(screen.getByRole('group', { name: 'Ações do laudo' }));
    expect(actions.getByRole('status')).toHaveTextContent('Rascunho salvo no sistema');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeEnabled();

    await user.type(screen.getByLabelText('Título'), ' — alteração local');
    expect(actions.getByRole('status')).toHaveTextContent('Alterações não salvas');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByLabelText('Título')).toHaveValue('Resultado fictício — alteração local');

    await user.click(actions.getByRole('button', { name: 'Recarregar rascunho' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Descartar alterações?');

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(actions.getByRole('status')).toHaveTextContent('Alterações não salvas');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByLabelText('Título')).toHaveValue('Resultado fictício — alteração local');
    await user.click(actions.getByRole('button', { name: 'Recarregar rascunho' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar e recarregar' }));

    expect(screen.getByLabelText('Título')).toHaveValue('Resultado fictício');
    expect(actions.getByRole('status')).toHaveTextContent('Rascunho salvo no sistema');
    expect(actions.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });
});
