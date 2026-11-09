import { describe, expect, it } from 'vitest';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

const ANA_PUBLISHED = 'aaaaaaaa-0000-4000-8000-000000000001';
const ANA_DRAFT = 'aaaaaaaa-0000-4000-8000-000000000002';
const ANA_EMPTY = 'aaaaaaaa-0000-4000-8000-000000000003';
const BRUNO_PUBLISHED = 'bbbbbbbb-0000-4000-8000-000000000001';
const ANA_CANCELED = 'aaaaaaaa-0000-4000-8000-000000000004';

async function arrange() {
  const db = testPrisma();
  const base = {
    examTypeId: QA.xrayId,
    status: 'SCHEDULED' as const,
    createdAt: new Date(QA.now),
  };
  await db.appointment.createMany({
    data: [
      { ...base, id: ANA_PUBLISHED, patientId: QA.anaId, startsAt: new Date('2026-11-10T13:00:00.000Z') },
      { ...base, id: ANA_DRAFT, patientId: QA.anaId, startsAt: new Date('2026-11-10T13:30:00.000Z') },
      { ...base, id: ANA_EMPTY, patientId: QA.anaId, startsAt: new Date('2026-11-10T14:00:00.000Z') },
      { ...base, id: BRUNO_PUBLISHED, patientId: QA.brunoId, startsAt: new Date('2026-11-10T14:30:00.000Z') },
      {
        ...base,
        id: ANA_CANCELED,
        patientId: QA.anaId,
        startsAt: new Date('2026-11-10T15:00:00.000Z'),
        status: 'CANCELED' as const,
        canceledAt: new Date(QA.now),
      },
    ],
  });
  await db.report.createMany({
    data: [
      {
        id: 'cccccccc-0000-4000-8000-000000000001',
        appointmentId: ANA_PUBLISHED,
        title: 'Laudo publicado da Ana',
        body: 'Conteúdo publicado fictício com mais de dez caracteres.',
        professionalName: 'Dra. QA',
        status: 'PUBLISHED',
        publishedAt: new Date(QA.now),
        createdAt: new Date(QA.now),
        updatedAt: new Date(QA.now),
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000002',
        appointmentId: ANA_DRAFT,
        title: 'SENTINELA-RASCUNHO-ANA',
        body: 'SENTINELA-TEXTO-RASCUNHO que nunca deve chegar ao paciente.',
        professionalName: 'Dra. QA',
        status: 'DRAFT',
        publishedAt: null,
        createdAt: new Date(QA.now),
        updatedAt: new Date(QA.now),
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000003',
        appointmentId: BRUNO_PUBLISHED,
        title: 'Laudo do Bruno',
        body: 'Conteúdo do Bruno, privado.',
        professionalName: 'Dra. QA',
        status: 'PUBLISHED',
        publishedAt: new Date(QA.now),
        createdAt: new Date(QA.now),
        updatedAt: new Date(QA.now),
      },
    ],
  });
}

describe('RF-08 · cenários 2, 3 e 4: isolamento e publicação', () => {
  it('cenário 2: paciente não lê laudo de outro paciente', async () => {
    await arrange();
    const app = await buildTestApp();
    const bruno = await login(app, 'bruno@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: `/me/appointments/${ANA_PUBLISHED}/report`,
      headers: auth(bruno),
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Laudo publicado da Ana');
  });

  it('cenário 3: paciente não acessa rascunho e não vê nenhuma sentinela', async () => {
    await arrange();
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: `/me/appointments/${ANA_DRAFT}/report`,
      headers: auth(ana),
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('SENTINELA');
  });

  it('cenário 4: rascunho invisível só se torna público após publicação HTTP da equipe', async () => {
    await arrange();
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');
    const bruno = await login(app, 'bruno@qa.test');
    const staff = await login(app, 'equipe@qa.test');
    const before = await testPrisma().report.findUniqueOrThrow({
      where: { appointmentId: ANA_DRAFT },
    });
    expect(before.status).toBe('DRAFT');
    expect(before.publishedAt).toBeNull();

    const hidden = await app.inject({
      method: 'GET', url: `/me/appointments/${ANA_DRAFT}/report`, headers: auth(ana),
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).not.toContain('SENTINELA');
    const listBefore = await app.inject({
      method: 'GET', url: '/me/appointments', headers: auth(ana),
    });
    expect(listBefore.statusCode).toBe(200);
    expect(listBefore.json<{ id: string; hasPublishedReport: boolean }[]>()
      .find((item) => item.id === ANA_DRAFT)?.hasPublishedReport).toBe(false);
    expect(listBefore.body).not.toContain('SENTINELA');

    const published = await app.inject({
      method: 'POST', url: `/reports/${before.id}/publish`, headers: auth(staff),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({
      id: before.id, appointmentId: ANA_DRAFT, status: 'PUBLISHED',
      publishedAt: QA.now, updatedAt: QA.now,
    });
    expect(await testPrisma().report.findUniqueOrThrow({
      where: { id: before.id },
    })).toEqual({
      ...before, status: 'PUBLISHED',
      publishedAt: new Date(QA.now), updatedAt: new Date(QA.now),
    });

    const listAfter = await app.inject({
      method: 'GET', url: '/me/appointments', headers: auth(ana),
    });
    expect(listAfter.statusCode).toBe(200);
    expect(listAfter.json<{ id: string; hasPublishedReport: boolean }[]>()
      .find((item) => item.id === ANA_DRAFT)?.hasPublishedReport).toBe(true);
    const response = await app.inject({
      method: 'GET', url: `/me/appointments/${ANA_DRAFT}/report`, headers: auth(ana),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      title: before.title, body: before.body, professionalName: before.professionalName,
      publishedAt: QA.now, startsAt: '2026-11-10T13:30:00.000Z',
      examType: { name: 'Raio-X de tórax' },
    });
    const forbidden = await app.inject({
      method: 'GET', url: `/me/appointments/${ANA_DRAFT}/report`, headers: auth(bruno),
    });
    expect(forbidden.statusCode).toBe(404);
    expect(forbidden.body).toBe(hidden.body);
  });

  it('quatro casos indisponíveis usam o mesmo corpo byte a byte', async () => {
    await arrange();
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');

    const bodies = await Promise.all([
      // Alheio
      app.inject({
        method: 'GET',
        url: `/me/appointments/${BRUNO_PUBLISHED}/report`,
        headers: auth(ana),
      }),
      // Inexistente
      app.inject({
        method: 'GET',
        url: '/me/appointments/ffffffff-ffff-4fff-8fff-ffffffffffff/report',
        headers: auth(ana),
      }),
      // Próprio sem laudo
      app.inject({
        method: 'GET',
        url: `/me/appointments/${ANA_EMPTY}/report`,
        headers: auth(ana),
      }),
      // Próprio em rascunho
      app.inject({
        method: 'GET',
        url: `/me/appointments/${ANA_DRAFT}/report`,
        headers: auth(ana),
      }),
    ]);

    const expected = '{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}';
    for (const response of bodies) {
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toBe(expected);
    }
  });

  it('lista própria inclui cancelados e nunca revela rascunho', async () => {
    await arrange();
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: '/me/appointments',
      headers: auth(ana),
    });

    expect(response.statusCode).toBe(200);
    const items = response.json<{
      id: string; status: string; hasPublishedReport: boolean;
    }[]>();
    expect(items.map((item) => item.id)).toEqual([ANA_PUBLISHED, ANA_DRAFT, ANA_EMPTY, ANA_CANCELED]);
    expect(items.map((item) => item.hasPublishedReport)).toEqual([true, false, false, false]);
    expect(items.at(-1)?.status).toBe('CANCELED');
    expect(response.body).not.toContain('SENTINELA');
    expect(response.body).not.toContain('DRAFT');
    expect(response.body).not.toContain('Ana QA');
  });

  it('equipe não usa o portal do paciente', async () => {
    await arrange();
    const app = await buildTestApp();
    const staff = await login(app, 'equipe@qa.test');
    const response = await app.inject({
      method: 'GET',
      url: '/me/appointments',
      headers: auth(staff),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Portal · autorização por subject e ordenação sem janela implícita', () => {
  it('não aceita patientId/userId em query como tentativa de selecionar outro paciente', async () => {
    await arrange();
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');
    for (const url of [
      `/me/appointments?patientId=${QA.brunoId}`,
      `/me/appointments?userId=${QA.brunoId}`,
      `/me/appointments/${BRUNO_PUBLISHED}/report?patientId=${QA.brunoId}`,
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: auth(ana) });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(response.body).not.toContain('Conteúdo do Bruno');
      expect(response.body).not.toContain('SENTINELA');
    }
    const own = await app.inject({ method: 'GET', url: '/me/appointments', headers: auth(ana) });
    expect(own.statusCode).toBe(200);
    expect(own.json<{ id: string }[]>().map((item) => item.id)).toEqual([
      ANA_PUBLISHED, ANA_DRAFT, ANA_EMPTY, ANA_CANCELED,
    ]);
  });

  it('inclui histórico e futuro distante, ordenando por startsAt e id nos empates', async () => {
    await arrange();
    const ids = {
      old: 'aa000000-0000-4000-8000-000000000001',
      canceledA: 'aa000000-0000-4000-8000-000000000002',
      canceledB: 'aa000000-0000-4000-8000-000000000003',
      future: 'aa000000-0000-4000-8000-000000000004',
    };
    const base = { patientId: QA.anaId, examTypeId: QA.xrayId, createdAt: new Date(QA.now) };
    await testPrisma().appointment.createMany({ data: [
      { ...base, id: ids.future, startsAt: new Date('2028-11-10T13:00:00.000Z') },
      { ...base, id: ids.canceledB, startsAt: new Date('2020-11-10T14:00:00.000Z'), status: 'CANCELED', canceledAt: new Date(QA.now) },
      { ...base, id: ids.old, startsAt: new Date('2020-11-10T13:00:00.000Z') },
      { ...base, id: ids.canceledA, startsAt: new Date('2020-11-10T14:00:00.000Z'), status: 'CANCELED', canceledAt: new Date(QA.now) },
    ] });
    const app = await buildTestApp();
    const ana = await login(app, 'ana@qa.test');
    const response = await app.inject({ method: 'GET', url: '/me/appointments', headers: auth(ana) });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ id: string }[]>().map((item) => item.id)).toEqual([
      ids.old, ids.canceledA, ids.canceledB,
      ANA_PUBLISHED, ANA_DRAFT, ANA_EMPTY, ANA_CANCELED, ids.future,
    ]);
    const items = response.json<Record<string, unknown>[]>();
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        'examType', 'hasPublishedReport', 'id', 'startsAt', 'status',
      ]);
    }
    expect(response.body).not.toContain('SENTINELA');
    expect(response.body).not.toContain('password');
    expect(response.body).not.toContain(QA.brunoId);
  });
});
