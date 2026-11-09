import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { LOGIN_RATE_LIMIT_WINDOW_SECONDS } from '@drlaudo/contract';
import type { Clock } from './clock.ts';
import { DomainError, toErrorBody } from './errors.ts';
import { registerRequestParsing } from './lib/request.ts';
import { apiLoggerOptions } from './lib/logger.ts';
import type { PrismaClient } from './prisma.ts';
import { registerAuth } from './plugins/auth.ts';
import { registerHealthRoutes } from './features/health/health.routes.ts';
import { createAuthService } from './features/auth/auth.service.ts';
import { registerAuthRoutes } from './features/auth/auth.routes.ts';
import { registerPatientsRoutes } from './features/patients/patients.routes.ts';
import { registerExamTypesRoutes } from './features/exam-types/exam-types.routes.ts';
import { registerSlotsRoutes } from './features/slots/slots.routes.ts';
import { createAppointmentsService } from './features/appointments/appointments.service.ts';
import { registerAppointmentsRoutes } from './features/appointments/appointments.routes.ts';
import { createReportsService } from './features/reports/reports.service.ts';
import { registerReportsRoutes } from './features/reports/reports.routes.ts';
import { createMeService } from './features/me/me.service.ts';
import { registerMeRoutes } from './features/me/me.routes.ts';
import { createPatientsService } from './features/patients/patients.service.ts';
import { createExamTypesService } from './features/exam-types/exam-types.service.ts';
import { createHealthService } from './features/health/health.service.ts';
import { createSlotsService } from './features/slots/slots.service.ts';

export interface AppConfig {
  jwtSecret: string;
  loginRateLimitMax: number;
  trustProxyHops: number;
  logger?: FastifyServerOptions['logger'];
}

export interface BuildAppOptions {
  prisma: PrismaClient;
  clock: Clock;
  config: AppConfig;
}

export async function buildApp({ prisma, clock, config }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger ? {
      ...(typeof config.logger === 'object' ? config.logger : {}),
      ...apiLoggerOptions,
    } : false,
    // Hop zero is the socket peer; never trust an unbounded forwarded chain.
    trustProxy: (_address, hop) => hop < config.trustProxyHops,
    bodyLimit: 1_048_576,
    ajv: { customOptions: { allErrors: false } },
  });

  // Contract requires no-store on every response, including errors.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  registerAuth(app, { prisma, secret: config.jwtSecret, clock });

  await app.register(rateLimit, {
    global: false,
    max: config.loginRateLimitMax,
    timeWindow: LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000,
    // Only a configured proxy chain is trusted; raw X-Forwarded-For is not.
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => new DomainError('RATE_LIMITED'),
  });
  registerRequestParsing(app);

  const authService = createAuthService({
    prisma,
    clock,
    signToken: (payload) => app.jwt.sign(payload),
  });
  const appointmentsService = createAppointmentsService({ prisma, clock });
  const reportsService = createReportsService({ prisma, clock });
  const meService = createMeService({ prisma });
  const patientsService = createPatientsService({ prisma, clock });
  const examTypesService = createExamTypesService({ prisma });
  const healthService = createHealthService({ prisma });
  const slotsService = createSlotsService({ prisma, clock });

  registerHealthRoutes(app, healthService);
  registerAuthRoutes(app, authService);
  registerPatientsRoutes(app, patientsService);
  registerExamTypesRoutes(app, examTypesService);
  registerSlotsRoutes(app, slotsService);
  registerAppointmentsRoutes(app, appointmentsService);
  registerReportsRoutes(app, reportsService);
  registerMeRoutes(app, meService);

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send(toErrorBody(new DomainError('NOT_FOUND')).body);
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof DomainError) {
      const { status, body } = toErrorBody(error);
      return reply.code(status).send(body);
    }

    // IncomingMessage.destroyed can be true after a normal body read.
    // Only a closed socket or response indicates the client cannot receive it.
    if (request.raw.socket.destroyed || reply.raw.destroyed) {
      request.log.info('Requisição cancelada pelo cliente');
      return reply;
    }

    request.log.error({ err: error }, 'Erro inesperado');
    const { status, body } = toErrorBody(error);
    return reply.code(status).send(body);
  });

  return app;
}
