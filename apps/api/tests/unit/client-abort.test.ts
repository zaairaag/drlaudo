import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { fixedClock } from '../../src/clock.ts';
import { createPrisma } from '../../src/prisma.ts';

const DEADLINE_MS = 2_000;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => { throw new Error('Deferred não inicializado'); };
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// O prazo usa relógio real: timers simulados não conduzem o I/O dos sockets HTTP.
async function within<T>(promise: Promise<T>, description: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${description}: limite de ${DEADLINE_MS} ms excedido`)), DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Prisma é real e lazy; as rotas destes testes não acessam o banco.
async function withApp(run: (app: FastifyInstance) => Promise<void>): Promise<void> {
  const prisma = createPrisma('postgresql://nao-conectar:nao-conectar@127.0.0.1:1/drlaudo_test');
  try {
    const app = await buildApp({
      prisma,
      clock: fixedClock('2026-11-10T12:00:00.000Z'),
      config: {
        jwtSecret: 'qa-secret-with-at-least-32-characters!!',
        trustProxyHops: 0,
        loginRateLimitMax: 10,
      },
    });
    try {
      await run(app);
    } finally {
      app.server.closeAllConnections();
      await app.close();
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function readResponse(url: string, init: RequestInit): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  try {
    const response = fetch(url, { ...init, signal: controller.signal }).then(async (received) => ({
      status: received.status,
      body: await received.text(),
    }));
    return await within(response, `${init.method ?? 'GET'} ${new URL(url).pathname}: aguardando resposta HTTP completa`);
  } finally {
    controller.abort();
  }
}

describe('HTTP real · falhas e cancelamento pelo cliente', () => {
  it.each(['GET', 'POST'] as const)(
    'retorna 500 e INTERNAL_ERROR para falha assíncrona em %s com cliente conectado',
    async (method) => {
      await withApp(async (app) => {
        const failed = deferred();
        let receivedBody: unknown;
        let socketDestroyedAtFailure: boolean | undefined;
        app.route({
          method,
          url: '/falha',
          config: { access: 'public', bodyExpected: method === 'POST' },
          handler: async (request) => {
            receivedBody = request.body;
            await new Promise<void>((resolve) => setImmediate(resolve));
            socketDestroyedAtFailure = request.raw.socket.destroyed;
            failed.resolve();
            throw new Error('falha inesperada de teste');
          },
        });

        const address = await app.listen({ port: 0, host: '127.0.0.1' });
        const init: RequestInit = method === 'POST'
          ? {
            method,
            headers: { 'content-type': 'application/json', connection: 'close' },
            body: '{"campo":"valor"}',
          }
          : { method, headers: { connection: 'close' } };
        const [response] = await Promise.all([
          readResponse(`${address}/falha`, init),
          within(failed.promise, `${method} /falha: aguardando falha do handler`),
        ]);

        expect(socketDestroyedAtFailure).toBe(false);
        if (method === 'POST') expect(receivedBody).toEqual({ campo: 'valor' });
        expect(response.status).toBe(500);
        const body: unknown = JSON.parse(response.body);
        expect(body).toStrictEqual({
          error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' },
        });
      });
    },
  );

  it('continua atendendo depois de uma desconexão real durante o handler', async () => {
    await withApp(async (app) => {
      const entered = deferred();
      const disconnected = deferred();
      const failed = deferred();
      app.get('/lento', { config: { access: 'public' } }, async (request) => {
        request.raw.socket.once('close', () => disconnected.resolve());
        entered.resolve();
        await disconnected.promise;
        failed.resolve();
        throw new Error('falha depois da desconexão');
      });
      app.get('/funciona', { config: { access: 'public' } }, async () => ({ status: 'ok' }));

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      const controller = new AbortController();
      try {
        const pending = fetch(`${address}/lento`, {
          signal: controller.signal,
          headers: { connection: 'close' },
        }).then(
          (response) => `HTTP ${response.status}`,
          (error: unknown) => error instanceof Error ? error.name : 'erro desconhecido',
        );
        await within(entered.promise, 'GET /lento: aguardando entrada no handler');
        controller.abort();
        const [clientResult] = await Promise.all([
          within(pending, 'GET /lento: aguardando cancelamento do cliente'),
          within(failed.promise, 'GET /lento: aguardando fechamento do socket e falha do handler'),
        ]);
        expect(clientResult).toBe('AbortError');

        // Permite que a rejeição do handler alcance o tratamento global antes da próxima chamada.
        await new Promise<void>((resolve) => setImmediate(resolve));
        const response = await readResponse(`${address}/funciona`, {
          method: 'GET',
          headers: { connection: 'close' },
        });
        expect(response.status).toBe(200);
        const body: unknown = JSON.parse(response.body);
        expect(body).toStrictEqual({ status: 'ok' });
      } finally {
        controller.abort();
      }
    });
  });
});
