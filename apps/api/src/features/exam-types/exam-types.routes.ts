import { EmptyObjectSchema, NoBodySchema } from '@drlaudo/contract';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/request.ts';
import type { ExamTypesService } from './exam-types.service.ts';

const listRequest = { params: EmptyObjectSchema, query: EmptyObjectSchema, body: NoBodySchema };

export function registerExamTypesRoutes(app: FastifyInstance, service: ExamTypesService): void {
  app.get('/exam-types', { config: { access: 'STAFF' } }, async (request) => {
    parseRequest(request, listRequest);
    return service.list();
  });
}
