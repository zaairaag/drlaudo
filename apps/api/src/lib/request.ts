import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { invalid } from '../errors.ts';
import { issuesFromZod, makeIssue, normalizeIssues } from './validation.ts';

type BodyIssue = 'UNEXPECTED_BODY' | 'INVALID_FORMAT' | 'INVALID_JSON';

declare module 'fastify' {
  interface FastifyRequest {
    inputBodyIssue?: BodyIssue;
    inputContentType?: string;
  }
  interface FastifyContextConfig {
    bodyExpected?: boolean;
  }
}

/** Auth and the login limiter run in onRequest, before any body is read. */
export function registerRequestParsing(app: FastifyInstance): void {
  app.decorateRequest('inputBodyIssue', undefined);
  app.decorateRequest('inputContentType', undefined);
  app.addHook('preParsing', async (request, reply, payload) => {
    if (request.routeOptions.config.bodyExpected) {
      const contentType = request.headers['content-type'];
      if (contentType !== undefined) request.inputContentType = contentType;
      // The parser below owns transport diagnostics, including malformed media
      // types. Fastify must not reject before independent params/query aggregate.
      request.headers['content-type'] = 'application/json';
      return payload;
    }

    // Keep the socket alive long enough to return the validation response.
    // Breaking a default async iterator destroys the underlying request stream.
    let nonempty = false;
    for await (const chunk of payload.iterator({ destroyOnReturn: false })) {
      if ((Buffer.isBuffer(chunk) && chunk.byteLength > 0)
        || (typeof chunk === 'string' && chunk.length > 0)) {
        nonempty = true;
        break;
      }
    }
    if (nonempty) {
      request.inputBodyIssue = 'UNEXPECTED_BODY';
      // Do not drain an unbounded body; close the connection after the response.
      reply.header('Connection', 'close');
    }
    delete request.headers['content-type'];
    delete request.headers['transfer-encoding'];
    request.headers['content-length'] = '0';
    return Readable.from([]);
  });

  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, done) => {
    if (body.length === 0) {
      done(null, undefined);
      return;
    }
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.inputContentType ?? '')) {
      request.inputBodyIssue = 'INVALID_FORMAT';
      done(null, undefined);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(body);
      done(null, parsed);
    } catch {
      request.inputBodyIssue = 'INVALID_JSON';
      done(null, undefined);
    }
  });
}

/** Reject duplicated query keys before any value is validated. */
function duplicateQueryKeys(url: string): string[] {
  const queryStart = url.indexOf('?');
  if (queryStart < 0) return [];
  const params = new URLSearchParams(url.slice(queryStart + 1));
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }
  return [...duplicated];
}

/** Every route validates all three parts before any domain service can run. */
export function parseRequest<Params, Query, Body>(
  request: FastifyRequest,
  schemas: { params: z.ZodType<Params>; query: z.ZodType<Query>; body: z.ZodType<Body> },
): { params: Params; query: Query; body: Body } {
  const params = schemas.params.safeParse(request.params ?? {});
  const query = schemas.query.safeParse(request.query ?? {});
  const body = request.inputBodyIssue ? undefined : schemas.body.safeParse(request.body);
  const duplicated = duplicateQueryKeys(request.raw.url ?? request.url);
  const duplicatedPaths = new Set(duplicated);
  const issues = [
    ...(params.success ? [] : issuesFromZod(params.error, 'params', request.params)),
    ...duplicated.map((key) => makeIssue('query', [key], 'DUPLICATE_QUERY')),
    ...(query.success ? [] : issuesFromZod(query.error, 'query', request.query).filter(
      (issue) => !(issue.path.length === 1 && duplicatedPaths.has(issue.path[0] ?? '')),
    )),
    ...(request.inputBodyIssue ? [makeIssue('body', [], request.inputBodyIssue)]
      : body && !body.success ? issuesFromZod(body.error, 'body', request.body) : []),
  ];
  if (!params.success || !query.success || !body?.success || issues.length > 0) {
    throw invalid(normalizeIssues(issues));
  }
  return { params: params.data, query: query.data, body: body.data };
}
