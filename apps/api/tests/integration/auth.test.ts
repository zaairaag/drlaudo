import { JwtClaimsSchema } from '@drlaudo/contract';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

describe('RF-01/RF-02 · autenticação e autorização reais', () => {
  it('autentica com bcrypt e devolve token com claims, sem hash', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'equipe@qa.test', password: QA.password },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ token: string; user: Record<string, unknown> }>();
    expect(body.user).toEqual({
      id: QA.staffId,
      name: 'Equipe QA',
      email: 'equipe@qa.test',
      role: 'STAFF',
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    const [, payload] = body.token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));
    expect(claims).toMatchObject({ sub: QA.staffId, role: 'STAFF', iss: 'drlaudo-api' });
    expect(claims.exp - claims.iat).toBe(28_800);
  });

  it('senha errada e e-mail inexistente devolvem exatamente o mesmo 401', async () => {
    const app = await buildTestApp();
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'equipe@qa.test', password: 'senha-errada' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ninguem@qa.test', password: 'senha-errada' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
    expect(wrong.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Autenticação necessária ou credenciais inválidas.',
      },
    });
  });

  it.each([
    ['ausente', undefined],
    ['malformado', 'Bearer nao-e-um-token'],
  ])('token %s não acessa rota protegida', async (_label, header) => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/patients',
      headers: header ? { authorization: header } : {},
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('token de outro emissor é rejeitado mesmo com assinatura do segredo', async () => {
    const app = await buildTestApp();
    const forged = app.jwt.sign(
      JwtClaimsSchema.parse(app.jwt.decode(await login(app, 'equipe@qa.test'))),
      { iss: 'outro-emissor' },
    );
    const response = await app.inject({ method: 'GET', url: '/patients', headers: auth(forged) });
    expect(response.statusCode).toBe(401);
  });

  it('token expirado pelo relógio da aplicação é rejeitado', async () => {
    const app = await buildTestApp();
    const expired = app.jwt.sign({
      sub: QA.staffId, role: 'STAFF', name: 'Equipe QA',
      iat: 1_700_000_000, exp: 1_700_028_800,
    });
    const response = await app.inject({ method: 'GET', url: '/patients', headers: auth(expired) });
    expect(response.statusCode).toBe(401);
  });

  it('perfil errado recebe 403 antes de qualquer consulta', async () => {
    const app = await buildTestApp();
    const patient = await login(app, 'ana@qa.test');
    const staffRoute = await app.inject({ method: 'GET', url: '/patients', headers: auth(patient) });
    expect(staffRoute.statusCode).toBe(403);
    expect(staffRoute.json().error.code).toBe('FORBIDDEN');

    const staff = await login(app, 'equipe@qa.test');
    const meRoute = await app.inject({
      method: 'GET',
      url: '/me/appointments',
      headers: auth(staff),
    });
    expect(meRoute.statusCode).toBe(403);
  });

  it('/auth/me devolve apenas o próprio usuário', async () => {
    const app = await buildTestApp();
    const patient = await login(app, 'ana@qa.test');
    const response = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(patient) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: QA.anaId,
      name: 'Ana QA',
      email: 'ana@qa.test',
      role: 'PATIENT',
    });
  });

  it('limita tentativas de login por IP e informa Retry-After', async () => {
    const app = await buildTestApp();
    const attempts = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'equipe@qa.test', password: 'errada' },
      }));
    }
    const limited = attempts.at(-1);
    expect(limited?.statusCode).toBe(429);
    expect(limited?.json().error.code).toBe('RATE_LIMITED');
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('JWT · relógio e identidade persistida', () => {
  it('verifica exp no mesmo clock injetado da emissão e expira no limite exato', async () => {
    let instant = '2000-01-01T00:00:00.000Z';
    const app = await buildApp({
      prisma: testPrisma(),
      clock: { now: () => new Date(instant) },
      config: {
        jwtSecret: 'qa-secret-with-at-least-32-characters!!',
        loginRateLimitMax: 10,
        trustProxyHops: 0,
      },
    });
    try {
      const token = await login(app, 'equipe@qa.test');
      const request = () => app.inject({ method: 'GET', url: '/patients', headers: auth(token) });
      expect((await request()).statusCode).toBe(200);
      instant = '2000-01-01T07:59:59.999Z';
      expect((await request()).statusCode).toBe(200);
      instant = '2000-01-01T08:00:00.000Z';
      const expired = await request();
      expect(expired.statusCode).toBe(401);
      expect(expired.json().error.code).toBe('UNAUTHORIZED');
    } finally {
      await app.close();
    }
  });

  it.each(['removido', 'rebaixado'] as const)(
    'nega token assinado quando o usuário foi %s',
    async (state) => {
      const app = await buildTestApp();
      const token = await login(app, 'equipe@qa.test');
      if (state === 'removido') {
        await testPrisma().user.delete({ where: { id: QA.staffId } });
      } else {
        await testPrisma().user.update({ where: { id: QA.staffId }, data: { role: 'PATIENT' } });
      }
      for (const url of ['/patients', '/auth/me']) {
        const response = await app.inject({ method: 'GET', url, headers: auth(token) });
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe('UNAUTHORIZED');
      }
    },
  );

  it('rejeita assinatura alterada e algoritmo não autorizado', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const parts = token.split('.');
    const signature = parts[2] ?? '';
    const altered = `${parts[0]}.${parts[1]}.${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
    const otherAlgorithm = app.jwt.sign(
      JwtClaimsSchema.parse(app.jwt.decode(token)),
      { algorithm: 'HS512' },
    );
    for (const invalidToken of [altered, otherAlgorithm]) {
      const response = await app.inject({
        method: 'GET', url: '/patients', headers: auth(invalidToken),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    }
  });
});
