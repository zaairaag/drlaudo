import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { EmptyObjectSchema, IdParamsSchema, NoBodySchema } from '@drlaudo/contract';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { fixedClock } from '../../src/clock.ts';
import { toErrorBody } from '../../src/errors.ts';
import { parseRequest, registerRequestParsing } from '../../src/lib/request.ts';
import { createPrisma } from '../../src/prisma.ts';

const input = { params: IdParamsSchema, query: EmptyObjectSchema, body: NoBodySchema };

type BodyFraming = 'content-length' | 'chunked' | 'chunked-open';

interface HealthHttpResponse {
  statusCode: number | undefined;
  contentType: string | undefined;
  connection: string | undefined;
  body: string;
  uploadEnded: boolean;
}

async function getHealthWithBody(port: number, framing: BodyFraming): Promise<HealthHttpResponse> {
  const headers: OutgoingHttpHeaders = { 'content-type': 'application/json' };
  if (framing === 'content-length') headers['content-length'] = '1';
  else headers['transfer-encoding'] = 'chunked';

  const client = httpRequest({ host: '127.0.0.1', port, path: '/health', method: 'GET', headers, agent: false });
  let responseStream: IncomingMessage | undefined;
  let deadline: NodeJS.Timeout | undefined;
  try {
    return await new Promise<HealthHttpResponse>((resolve, reject) => {
      // Real time bounds a stalled socket; fake timers cannot drive network I/O.
      deadline = setTimeout(() => reject(new Error('A resposta HTTP não chegou dentro do prazo.')), 2_000);
      client.once('error', reject);
      client.once('response', (response) => {
        responseStream = response;
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => { body += chunk; });
        response.once('error', reject);
        response.once('aborted', () => reject(new Error('A resposta HTTP foi interrompida.')));
        response.once('end', () => {
          const result = {
            statusCode: response.statusCode,
            contentType: response.headers['content-type'],
            connection: response.headers.connection,
            body,
            uploadEnded: client.writableEnded,
          };
          const socket = client.socket;
          if (framing !== 'chunked-open' || !socket || socket.destroyed) resolve(result);
          else socket.once('close', () => resolve(result));
        });
      });

      // An open chunked upload never sends the terminating chunk before the response.
      if (framing === 'chunked-open') client.write('{');
      else client.end('{');
    });
  } finally {
    clearTimeout(deadline);
    responseStream?.destroy();
    client.destroy();
  }
}

describe('NoBody · rejeição limitada ao primeiro chunk não vazio', () => {
  it('não pede o segundo chunk e agrega params/query sem aguardar fim do corpo', async () => {
    let reads = 0;
    const payload = Readable.from((async function* () {
      reads += 1;
      yield Buffer.from('{');
      reads += 1;
      throw new Error('Segundo chunk não pode ser solicitado em uma rota NoBody.');
    })(), { objectMode: false, highWaterMark: 0 });
    const app = Fastify();
    // A real preParsing transport stream, without light-my-request prefetch
    // obscuring which chunks the application itself asks to consume.
    app.addHook('preParsing', async () => payload);
    registerRequestParsing(app);
    app.get('/stream/:id', async (request) => {
      parseRequest(request, input);
      throw new Error('Nenhum handler de domínio deve executar com entrada inválida.');
    });
    app.setErrorHandler(async (error, _request, reply) => {
      const mapped = toErrorBody(error);
      return reply.code(mapped.status).send(mapped.body);
    });
    try {
      const response = await app.inject({
        method: 'GET', url: '/stream/invalido?unknown=value',
        headers: { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: {
        code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [
          { location: 'params', path: ['id'], rule: 'INVALID_FORMAT', message: 'Formato de valor inválido.' },
          { location: 'query', path: ['unknown'], rule: 'UNKNOWN_FIELD', message: 'Campo não permitido.' },
          { location: 'body', path: [], rule: 'UNEXPECTED_BODY', message: 'Não envie corpo nesta requisição.' },
        ],
      } });
      expect(reads).toBe(1);
    } finally {
      payload.destroy();
      await app.close();
    }
  });

  it('401 continua antes de qualquer leitura de corpo', async () => {
    let reads = 0;
    const payload = new Readable({
      read() {
        reads += 1;
        this.destroy(new Error('Auth deve rejeitar antes de consumir o corpo.'));
      },
    });
    const prisma = createPrisma('postgresql://nao-conectar:nao-conectar@127.0.0.1:1/drlaudo_test');
    const app = await buildApp({
      prisma, clock: fixedClock('2026-11-10T12:00:00.000Z'),
      config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', trustProxyHops: 0, loginRateLimitMax: 10 },
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/patients', payload });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
      expect(reads).toBe(0);
    } finally {
      payload.destroy();
      await app.close();
      await prisma.$disconnect();
    }
  });
});

describe('NoBody · resposta HTTP com transporte real', () => {
  it.each([
    ['Content-Length de um byte', 'content-length'],
    ['chunked concluído', 'chunked'],
    ['chunked ainda aberto após o primeiro byte', 'chunked-open'],
  ] as const)('retorna erro de validação para %s', async (_description, framing) => {
    const prisma = createPrisma('postgresql://nao-conectar:nao-conectar@127.0.0.1:1/drlaudo_test');
    try {
      const app = await buildApp({
        prisma, clock: fixedClock('2026-11-10T12:00:00.000Z'),
        config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', trustProxyHops: 0, loginRateLimitMax: 10 },
      });
      try {
        await app.listen({ host: '127.0.0.1', port: 0 });
        const address = app.server.address();
        if (address === null || typeof address === 'string') throw new Error('Servidor HTTP sem porta TCP.');

        const response = await getHealthWithBody(address.port, framing);
        expect(response.statusCode).toBe(400);
        expect(response.contentType).toMatch(/^application\/json;\s*charset=utf-8$/i);
        const body: unknown = JSON.parse(response.body);
        expect(body).toEqual({ error: {
          code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [
            { location: 'body', path: [], rule: 'UNEXPECTED_BODY', message: 'Não envie corpo nesta requisição.' },
          ],
        } });
        if (framing === 'chunked-open') {
          expect(response.uploadEnded).toBe(false);
          expect(response.connection).toBe('close');
        }
      } finally {
        app.server.closeAllConnections();
        await app.close();
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 10_000);
});
