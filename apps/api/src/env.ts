import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// A single root .env is shared by web and API; external variables win.
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // A malformed file is reported by the schema below, never by its contents.
  }
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3333),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Never echo values, only the offending variable names.
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Configuração de ambiente inválida: ${names.join(', ')}`);
  }
  return parsed.data;
}

export const env: ApiEnv = loadEnv();

const QA_QUERY_OPTIONS: Readonly<Record<string, true>> = {
  schema: true,
  sslmode: true,
  application_name: true,
  connect_timeout: true,
  connection_limit: true,
  pool_timeout: true,
};

function databasePath(value: string): string {
  try {
    if (value !== value.trim()) throw new Error();
    for (let index = 0; index < value.length; index += 1) {
      if (value.charCodeAt(index) <= 32) throw new Error();
    }
    // Validate escapes before URL normalization; never accept a malformed
    // escape that the PostgreSQL parser might interpret differently.
    decodeURIComponent(value);
    const parsed = new URL(value);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new Error();
    if (!parsed.hostname || parsed.hostname.includes('%') || parsed.hash) throw new Error();
    const seen = new Set<string>();
    for (const key of parsed.searchParams.keys()) {
      // pg reparses connectionString and accepts host/user/port in the query.
      // An allowlist prevents those aliases from changing the validated target.
      if (!Object.hasOwn(QA_QUERY_OPTIONS, key) || seen.has(key)) throw new Error();
      seen.add(key);
    }
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.length <= 1 || pathname.includes('\0')) throw new Error();
    return pathname;
  } catch {
    throw new Error('URLs de QA devem identificar explicitamente um banco PostgreSQL sem aliases de conexão.');
  }
}

export function testDatabaseUrl(loaded: ApiEnv = env): string {
  if (loaded.NODE_ENV !== 'test') {
    throw new Error('Operações de QA exigem NODE_ENV=test.');
  }
  const value = loaded.DATABASE_URL_TEST;
  if (!value) throw new Error('DATABASE_URL_TEST é obrigatória para operações de QA.');
  if (databasePath(value) !== '/drlaudo_test') {
    throw new Error('DATABASE_URL_TEST deve apontar para o banco drlaudo_test.');
  }
  // Also validate the primary URL: query aliases must not disguise its target.
  // A single database is permitted only because both actual pathnames are QA
  // and the caller explicitly selected the test environment above.
  databasePath(loaded.DATABASE_URL);
  return value;
}
