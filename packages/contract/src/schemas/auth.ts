import { z } from 'zod';
import { JWT_ISSUER, SESSION_DURATION_SECONDS } from '../constants.js';
import { RoleSchema } from '../enums.js';
import { EmailSchema, TokenSchema, UUIDSchema } from './common.js';

export const UserSchema = z.strictObject({
  id: UUIDSchema,
  name: z.string().min(1),
  email: EmailSchema,
  role: RoleSchema,
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.strictObject({
  token: TokenSchema,
  user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Payload validation does not verify signatures or expiry against the current clock.
export const JwtClaimsSchema = z
  .strictObject({
    sub: UUIDSchema,
    role: RoleSchema,
    name: z.string().min(1),
    iss: z.literal(JWT_ISSUER),
    iat: z.number().nonnegative().refine(Number.isSafeInteger),
    exp: z.number().refine(Number.isSafeInteger),
  })
  .refine(({ iat, exp }) => exp === iat + SESSION_DURATION_SECONDS, { path: ['exp'] });
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;
