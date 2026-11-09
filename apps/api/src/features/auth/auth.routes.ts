import { EmptyObjectSchema, LoginRequestSchema, NoBodySchema } from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { currentUserId } from '../../plugins/auth.ts';
import { parseRequest } from '../../lib/request.ts';
import type { AuthService } from './auth.service.ts';

const meRequest = { params: EmptyObjectSchema, query: EmptyObjectSchema, body: NoBodySchema };
const loginRequest = { ...meRequest, body: LoginRequestSchema };

export function registerAuthRoutes(app: FastifyInstance, service: AuthService): void {
  // `{}` inherits the registered max/timeWindow and runs before preParsing.
  app.post('/auth/login', { config: { access: 'public', rateLimit: {}, bodyExpected: true } }, async (request) => {
    const { body } = parseRequest(request, loginRequest);
    return service.login(body);
  });

  app.get('/auth/me', { config: { access: 'any' } }, async (request) => {
    parseRequest(request, meRequest);
    return service.me(currentUserId(request));
  });
}
