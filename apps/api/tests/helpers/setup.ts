import bcrypt from 'bcryptjs';
import { afterAll, beforeEach } from 'vitest';
import { fixedClock } from '../../src/clock.ts';
import { buildApp } from '../../src/app.ts';
import { testDatabaseUrl } from '../../src/env.ts';
import { createPrisma, type PrismaClient } from '../../src/prisma.ts';

/** QA fixtures are fixed and independent from the demo seed. */
export const QA = {
  staffId: '11111111-1111-4111-8111-111111111111',
  anaId: '22222222-2222-4222-8222-222222222222',
  brunoId: '33333333-3333-4333-8333-333333333333',
  xrayId: '44444444-4444-4444-8444-444444444444',
  ultrasoundId: '55555555-5555-4555-8555-555555555555',
  mriId: '66666666-6666-4666-8666-666666666666',
  password: 'Qa@12345',
  /** 09:00 in Brasília; 11:30Z and 12:00Z are already past that day. */
  now: '2026-11-10T12:00:00.000Z',
} as const;

let prisma: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  prisma ??= createPrisma(testDatabaseUrl());
  return prisma;
}

export async function truncateAll(): Promise<void> {
  await testPrisma().$executeRawUnsafe(
    'TRUNCATE "Report", "Appointment", "User", "ExamType" RESTART IDENTITY CASCADE',
  );
}

export async function seedBase(): Promise<void> {
  const db = testPrisma();
  const passwordHash = await bcrypt.hash(QA.password, 10);
  await db.user.createMany({
    data: [
      { id: QA.staffId, name: 'Equipe QA', email: 'equipe@qa.test', passwordHash, role: 'STAFF' },
      { id: QA.anaId, name: 'Ana QA', email: 'ana@qa.test', passwordHash, role: 'PATIENT' },
      { id: QA.brunoId, name: 'Bruno QA', email: 'bruno@qa.test', passwordHash, role: 'PATIENT' },
    ],
  });
  await db.examType.createMany({
    data: [
      { id: QA.xrayId, code: 'XRAY', name: 'Raio-X de tórax' },
      { id: QA.ultrasoundId, code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
      { id: QA.mriId, code: 'MRI', name: 'Ressonância de crânio' },
    ],
  });
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

export async function buildTestApp(now: string = QA.now) {
  const app = await buildApp({
    prisma: testPrisma(),
    clock: fixedClock(now),
    config: { jwtSecret: 'qa-secret-with-at-least-32-characters!!', loginRateLimitMax: 10, trustProxyHops: 0 },
  });
  return app;
}

export async function login(app: TestApp, email: string, password: string = QA.password): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login QA não autenticou: HTTP ${response.statusCode}.`);
  }
  const body = response.json<{ token: string }>();
  return body.token;
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Registers lifecycle hooks shared by every integration file. */
export function useIsolatedDatabase(): void {
  beforeEach(async () => {
    await truncateAll();
    await seedBase();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    prisma = undefined;
  });
}
