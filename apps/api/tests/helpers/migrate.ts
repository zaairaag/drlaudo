import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { env, testDatabaseUrl, type ApiEnv } from '../../src/env.ts';

const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => `${migrationsDir}/${name}/migration.sql`);
}

/**
 * QA schema is disposable: dropped and rebuilt from the committed migrations
 * before the suite, so tests never inherit demo state or a stale shape.
 */
export async function migrateTestDatabase(loaded: ApiEnv = env): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl(loaded) });
  await client.connect();
  try {
    const target = await client.query<{ database: string }>('SELECT current_database() AS database');
    if (target.rows.length !== 1 || target.rows[0]?.database !== 'drlaudo_test') {
      throw new Error('A conexão de QA não selecionou o banco descartável drlaudo_test.');
    }
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    for (const file of migrationFiles()) {
      await client.query(readFileSync(file, 'utf8'));
    }
  } finally {
    await client.end();
  }
}
