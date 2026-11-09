import { migrateTestDatabase } from './helpers/migrate.ts';

export default async function setup(): Promise<void> {
  await migrateTestDatabase();
}
