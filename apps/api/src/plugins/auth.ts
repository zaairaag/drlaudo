import jwt from '@fastify/jwt';
import {
  JwtClaimsSchema,
  JWT_ISSUER,
  type JwtClaims,
  type Role,
} from '@drlaudo/contract';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors.ts';
import type { Clock } from '../clock.ts';
import type { PrismaClient } from '../prisma.ts';

export type Access = 'public' | 'any' | 'STAFF' | 'PATIENT';

declare module 'fastify' {
  interface FastifyRequest {
    claims?: JwtClaims;
  }
  interface FastifyContextConfig {
    access?: Access;
  }
}

export function currentClaims(request: FastifyRequest): JwtClaims {
  const claims = request.claims;
  if (!claims) throw unauthorized();
  return claims;
}

export function currentUserId(request: FastifyRequest): string {
  return currentClaims(request).sub;
}

export function requireRole(request: FastifyRequest, role: Role): JwtClaims {
  const claims = currentClaims(request);
  if (claims.role !== role) throw forbidden();
  return claims;
}

/**
 * Authentication runs in `onRequest`, i.e. before body parsing, so a missing
 * or invalid token always wins over malformed JSON — the documented order.
 */
export function registerAuth(
  app: FastifyInstance,
  options: { prisma: PrismaClient; secret: string; clock: Clock },
): void {
  app.register(jwt, {
    secret: options.secret,
    // `iat`/`exp` are supplied from the injected clock, so no expiresIn here.
    sign: { algorithm: 'HS256', iss: JWT_ISSUER },
    verify: { allowedIss: JWT_ISSUER, algorithms: ['HS256'] },
  });

  app.decorateRequest('claims', undefined);

  app.addHook('onRequest', async (request) => {
    const access = request.routeOptions.config?.access ?? 'public';
    if (access === 'public') return;

    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice('Bearer '.length).trim();
    if (token.length === 0) throw unauthorized();

    const now = options.clock.now().getTime();

    let payload: unknown;
    try {
      // fast-jwt's clockTimestamp is milliseconds, not JWT NumericDate seconds.
      // Per-request options track a moving injected clock without a stale verifier.
      payload = await request.jwtVerify({ clockTimestamp: now });
    } catch {
      throw unauthorized();
    }

    const parsed = JwtClaimsSchema.safeParse(payload);
    if (!parsed.success) throw unauthorized();
    // fast-jwt accepts equality; JWT exp is an exclusive boundary.
    if (parsed.data.exp <= Math.floor(now / 1000)) throw unauthorized();

    // Persisted identity/state is authoritative even for a valid signature.
    const user = await options.prisma.user.findUnique({
      where: { id: parsed.data.sub },
      select: { id: true, role: true, active: true },
    });
    if (!user || !user.active || user.role !== parsed.data.role) throw unauthorized();
    if (access !== 'any' && parsed.data.role !== access) throw forbidden();

    request.claims = parsed.data;
  });
}
