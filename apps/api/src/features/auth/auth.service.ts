import bcrypt from 'bcryptjs';
import {
  JwtClaimsSchema,
  LoginResponseSchema,
  UserSchema,
  JWT_ISSUER,
  SESSION_DURATION_SECONDS,
  type LoginRequest,
  type LoginResponse,
  type User,
} from '@drlaudo/contract';
import type { Clock } from '../../clock.ts';
import { unauthorized } from '../../errors.ts';
import type { PrismaClient } from '../../prisma.ts';

export interface AuthDeps {
  prisma: PrismaClient;
  clock: Clock;
  signToken: (payload: Record<string, unknown>) => string;
}

/**
 * A real cost-10 hash of an unrelated password. Comparing against it keeps the
 * unknown-email path as slow as a real one, so timing does not enumerate users.
 */
const DUMMY_HASH = '$2b$10$X1sCtACUxUtwkz4n3j6KPuloJbD.yD0t9CDu781DuHgTwY85GaRMm';

export function createAuthService({ prisma, clock, signToken }: AuthDeps) {
  return {
    async login(input: LoginRequest): Promise<LoginResponse> {
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
      });
      const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !matches || !user.active) throw unauthorized();

      const issuedAt = Math.floor(clock.now().getTime() / 1000);
      const issued = JwtClaimsSchema.parse({
        sub: user.id,
        role: user.role,
        name: user.name,
        iss: JWT_ISSUER,
        iat: issuedAt,
        exp: issuedAt + SESSION_DURATION_SECONDS,
      });
      const { sub, role, name, iat, exp } = issued;
      return LoginResponseSchema.parse({
        token: signToken({ sub, role, name, iat, exp }),
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    },

    async me(userId: string): Promise<User> {
      const user = await prisma.user.findUnique({
        where: { id: userId, active: true },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!user) throw unauthorized();
      return UserSchema.parse(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
