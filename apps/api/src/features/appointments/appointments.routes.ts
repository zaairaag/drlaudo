import {
  AppointmentListQuerySchema,
  CreateAppointmentRequestSchema,
  EmptyObjectSchema,
  IdParamsSchema,
  NoBodySchema,
} from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { AppointmentsService } from './appointments.service.ts';

const byIdRequest = { params: IdParamsSchema, query: EmptyObjectSchema, body: NoBodySchema };
const createRequest = { ...byIdRequest, params: EmptyObjectSchema, body: CreateAppointmentRequestSchema };
const listRequest = { ...byIdRequest, params: EmptyObjectSchema, query: AppointmentListQuerySchema };

export function registerAppointmentsRoutes(app: FastifyInstance, service: AppointmentsService): void {
  app.post('/appointments', { config: { access: 'STAFF', bodyExpected: true } }, async (request, reply) => {
    const { body } = parseRequest(request, createRequest);
    return reply.code(201).send(await service.create(body));
  });

  app.get('/appointments', { config: { access: 'STAFF' } }, async (request) => {
    const { query } = parseRequest(request, listRequest);
    return service.list(query);
  });

  app.get('/appointments/:id', { config: { access: 'STAFF' } }, async (request) => {
    const { params } = parseRequest(request, byIdRequest);
    return service.getById(params.id);
  });

  app.post('/appointments/:id/cancel', { config: { access: 'STAFF' } }, async (request) => {
    const { params } = parseRequest(request, byIdRequest);
    return service.cancel(params.id);
  });
}
