import {
  CreatePatientRequestSchema,
  UpdatePatientRequestSchema,
  EmptyObjectSchema,
  IdParamsSchema,
  NoBodySchema,
} from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { PatientsService } from './patients.service.ts';

const listRequest = { params: EmptyObjectSchema, query: EmptyObjectSchema, body: NoBodySchema };
const createRequest = { ...listRequest, body: CreatePatientRequestSchema };
const updateRequest = { ...listRequest, params: IdParamsSchema, body: UpdatePatientRequestSchema };

export function registerPatientsRoutes(app: FastifyInstance, service: PatientsService): void {
  app.get('/patients', { config: { access: 'STAFF' } }, async (request) => {
    parseRequest(request, listRequest);
    return service.list();
  });

  app.post('/patients', { config: { access: 'STAFF', bodyExpected: true } }, async (request, reply) => {
    const { body } = parseRequest(request, createRequest);
    return reply.code(201).send(await service.create(body));
  });

  app.patch('/patients/:id', { config: { access: 'STAFF', bodyExpected: true } }, async (request) => {
    const { params, body } = parseRequest(request, updateRequest);
    return service.update(params.id, body);
  });
}
