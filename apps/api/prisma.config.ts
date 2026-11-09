import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One root .env is shared by web and API. External variables still win because
// dotenv never overwrites an existing value.
loadDotenv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

// `generate` never connects, so a placeholder keeps it usable without a
// database; `migrate` and `db pull` still require the real DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
