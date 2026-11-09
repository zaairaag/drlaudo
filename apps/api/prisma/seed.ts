import { systemClock } from '../src/clock.ts';
import { createPrisma } from '../src/prisma.ts';
import { loadEnv } from '../src/env.ts';
import { seedDemo } from './seed-data.ts';

const loaded = loadEnv();
const prisma = createPrisma(loaded.DATABASE_URL);
try {
  await seedDemo({ prisma, clock: systemClock });
  console.log('Dados demonstrativos aplicados (idempotente).');
} finally {
  await prisma.$disconnect();
}
