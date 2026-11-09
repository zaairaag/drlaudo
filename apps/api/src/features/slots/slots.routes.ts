import { EmptyObjectSchema, NoBodySchema, SlotQuerySchema } from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { SlotsService } from './slots.service.ts';

const slotsRequest = { params: EmptyObjectSchema, query: SlotQuerySchema, body: NoBodySchema };

export function registerSlotsRoutes(app: FastifyInstance, service: SlotsService): void {
  app.get('/slots', { config: { access: 'STAFF' } }, async (request) => {
    const { query } = parseRequest(request, slotsRequest);
    return service.list(query);
  });
}
