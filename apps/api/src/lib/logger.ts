import type { FastifyRequest, FastifyServerOptions } from 'fastify';

/** Logs describe transport metadata, never request content or exception text. */
export const apiLoggerOptions = {
  serializers: {
    req: (request: FastifyRequest) => ({ method: request.method, route: request.routeOptions.url ?? '<unmatched>' }),
    res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
    err: (error: unknown) => {
      const code = typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string' && /^(?:P[0-9]{4}|FST_ERR_[A-Z_]+)$/.test(error.code)
        ? error.code : undefined;
      return {
        type: 'Error',
        message: 'Erro inesperado',
        stack: '',
        ...(code ? { code } : {}),
      };
    },
  },
  redact: {
    paths: [
      'req.headers', 'req.body', 'req.query', 'req.params', 'req.url', 'req.raw',
      'headers', 'body', 'query', 'params', 'password', 'passwordHash', 'token', 'authorization',
    ],
    remove: true,
  },
} satisfies Exclude<FastifyServerOptions['logger'], boolean | undefined>;
