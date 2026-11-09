import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { fixedClock } from '../../src/clock.ts';
import { createPrisma } from '../../src/prisma.ts';

// The real Prisma client is lazy; this route has no database I/O and no mock.
describe('logs HTTP · metadados sem dados privados', () => {
  it('registra rota parametrizada e erro sem path/query/body/token/SQL/segredo', async () => {
    const lines: string[] = [];
    const prisma = createPrisma('postgresql://nao-conectar:nao-conectar@127.0.0.1:1/drlaudo_test');
    const app = await buildApp({
      prisma,
      clock: fixedClock('2026-11-10T12:00:00.000Z'),
      config: {
        jwtSecret: 'qa-secret-with-at-least-32-characters!!',
        trustProxyHops: 0,
        loginRateLimitMax: 10,
        logger: { level: 'info', stream: { write: (line) => { lines.push(line); } } },
      },
    });
    app.post('/logging/:id', { config: { access: 'public', bodyExpected: true } }, async () => {
      throw new Error('SELECT texto-clinico-sensivel FROM tabela; postgresql://usuario:senha-supersecreta@db/prod');
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/logging/identificador-sensivel?password=senha-na-query&report=laudo-na-query',
        headers: { authorization: 'Bearer token-sensivel' },
        payload: { password: 'senha-no-body', body: 'laudo-no-body' },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_ERROR');
      const output = lines.join('\n');
      expect(output).toContain('/logging/:id');
      expect(output).toContain('Erro inesperado');
      for (const sensitive of [
        'identificador-sensivel', 'senha-na-query', 'laudo-na-query', 'token-sensivel',
        'senha-no-body', 'laudo-no-body', 'texto-clinico-sensivel', 'SELECT',
        'postgresql://', 'senha-supersecreta',
      ]) expect(output).not.toContain(sensitive);
    } finally {
      await app.close();
      await prisma.$disconnect();
    }
  });
});
