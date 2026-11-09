import { EmptyObjectSchema, IdParamsSchema, NoBodySchema } from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import { currentUserId } from '../../plugins/auth.ts';
import type { MeService } from './me.service.ts';

const listRequest = { params: EmptyObjectSchema, query: EmptyObjectSchema, body: NoBodySchema };
const reportRequest = { ...listRequest, params: IdParamsSchema };

export function registerMeRoutes(app: FastifyInstance, service: MeService): void {
  app.get('/me/appointments', { config: { access: 'PATIENT' } }, async (request) => {
    parseRequest(request, listRequest);
    return service.listAppointments(currentUserId(request));
  });

  app.get('/me/appointments/:id/report', { config: { access: 'PATIENT' } }, async (request) => {
    const { params } = parseRequest(request, reportRequest);
    return service.getPublishedReport(currentUserId(request), params.id);
  });
}
