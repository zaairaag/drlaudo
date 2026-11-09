import { EmptyObjectSchema, NoBodySchema } from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { HealthService } from './health.service.ts';

const healthRequest = { params: EmptyObjectSchema, query: EmptyObjectSchema, body: NoBodySchema };

export function registerHealthRoutes(app: FastifyInstance, service: HealthService): void {
  app.get('/health', { config: { access: 'public' } }, async (request) => {
    parseRequest(request, healthRequest);
    return service.get();
  });
}
