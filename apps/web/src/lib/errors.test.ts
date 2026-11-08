import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors';

describe('E2/E7 · erros apresentados com segurança', () => {
  it('distingue credenciais incorretas de sessão expirada pelo contexto', () => {
    const error = {
      status: 401,
      data: { error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária ou credenciais inválidas.' } },
    };
    expect(getErrorMessage(error, 'login')).toBe('E-mail ou senha incorretos.');
    expect(getErrorMessage(error, 'session')).toBe('Sua sessão expirou. Entre novamente.');
  });

  it('acrescenta a recuperação de um horário perdido sem mostrar o objeto de transporte', () => {
    expect(getErrorMessage({
      status: 409,
      data: { error: { code: 'SLOT_TAKEN', message: 'Este horário acabou de ser ocupado.' } },
    })).toBe('Este horário acabou de ser ocupado. Escolha outro.');
  });

  it('preserva a apresentação opaca de registro indisponível', () => {
    expect(getErrorMessage({ error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' } }))
      .toBe('Não encontramos este registro');
  });

  it('não reflete mensagens arbitrárias, stack ou dados de respostas inválidas', () => {
    expect(getErrorMessage({
      status: 500,
      data: { error: { code: 'INTERNAL_ERROR', message: 'senha=segredo; paciente=Ana; stack interna' } },
    })).toBe('Algo deu errado. Tente novamente em instantes.');
    expect(getErrorMessage(new Error('conteúdo clínico privado')))
      .toBe('Algo deu errado. Tente novamente em instantes.');
    expect(getErrorMessage(null)).toBe('Algo deu errado. Tente novamente em instantes.');
  });

  it('oferece resumo seguro para validação sem imprimir o diagnóstico bruto', () => {
    expect(getErrorMessage({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Os dados informados são inválidos.',
        details: [{ location: 'body', path: ['title'], rule: 'REQUIRED', message: 'Campo obrigatório.' }],
      },
    })).toBe('Confira os campos indicados e tente novamente.');
  });
});
