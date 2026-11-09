import {
  CreateReportRequestSchema,
  EmptyObjectSchema,
  IdParamsSchema,
  NoBodySchema,
  UpdateReportRequestSchema,
} from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { ReportsService } from './reports.service.ts';

const byIdRequest = { params: IdParamsSchema, query: EmptyObjectSchema, body: NoBodySchema };
const createRequest = { ...byIdRequest, body: CreateReportRequestSchema };
const updateRequest = { ...byIdRequest, body: UpdateReportRequestSchema };

export function registerReportsRoutes(app: FastifyInstance, service: ReportsService): void {
  app.post('/appointments/:id/report', { config: { access: 'STAFF', bodyExpected: true } }, async (request, reply) => {
    const { params, body } = parseRequest(request, createRequest);
    return reply.code(201).send(await service.create(params.id, body));
  });

  app.get('/appointments/:id/report', { config: { access: 'STAFF' } }, async (request) => {
    const { params } = parseRequest(request, byIdRequest);
    return service.getByAppointment(params.id);
  });

  app.patch('/reports/:id', { config: { access: 'STAFF', bodyExpected: true } }, async (request) => {
    const { params, body } = parseRequest(request, updateRequest);
    return service.update(params.id, body);
  });

  app.post('/reports/:id/publish', { config: { access: 'STAFF' } }, async (request) => {
    const { params } = parseRequest(request, byIdRequest);
    return service.publish(params.id);
  });
}
