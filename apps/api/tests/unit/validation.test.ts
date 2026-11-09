import { describe, expect, it } from 'vitest';
import { makeIssue, normalizeIssues } from '../../src/lib/validation.ts';

describe('validação · identidade dos caminhos dos detalhes', () => {
  it('preserva falha na raiz e campo desconhecido de nome vazio no mesmo corpo', () => {
    const root = makeIssue('body', [], 'EMPTY_PATCH');
    const emptyField = makeIssue('body', [''], 'UNKNOWN_FIELD');
    expect(normalizeIssues([emptyField, root, emptyField])).toEqual([root, emptyField]);
  });

  it('não confunde separador dentro de um segmento com dois segmentos distintos', () => {
    const embedded = makeIssue('query', ['a\u0001b'], 'UNKNOWN_FIELD');
    const nested = makeIssue('query', ['a', 'b'], 'INVALID_FORMAT');
    expect(normalizeIssues([embedded, nested])).toEqual([nested, embedded]);
  });
});
