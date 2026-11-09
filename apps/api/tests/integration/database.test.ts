import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { REPORT_INPUT } from '../helpers/report-scenario.ts';
import { QA, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

interface DatabaseIndex {
  name: string;
  tableName: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  predicate: string | null;
  definition: string;
}

const appointmentData = {
  patientId: QA.anaId, examTypeId: QA.xrayId,
  startsAt: new Date('2026-11-10T13:00:00.000Z'), createdAt: new Date(QA.now),
};

describe('PostgreSQL real · índices e colisões independentes do serviço', () => {
  it('inspeciona índices instalados válidos, parciais e únicos no catálogo PostgreSQL', async () => {
    const indexes = await testPrisma().$queryRaw<DatabaseIndex[]>`
      SELECT index_relation.relname AS name, table_relation.relname AS "tableName",
        index_data.indisunique AS unique, index_data.indisvalid AS valid,
        index_data.indisready AS ready,
        pg_get_expr(index_data.indpred, index_data.indrelid) AS predicate,
        pg_get_indexdef(index_data.indexrelid) AS definition
      FROM pg_index AS index_data
      JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
      JOIN pg_class AS table_relation ON table_relation.oid = index_data.indrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND index_relation.relname IN ('appointment_active_slot_unique', 'Report_appointmentId_key')
      ORDER BY index_relation.relname
    `;
    expect(indexes).toHaveLength(2);
    const slot = indexes.find((index) => index.name === 'appointment_active_slot_unique');
    expect(slot).toMatchObject({ tableName: 'Appointment', unique: true, valid: true, ready: true });
    expect(slot?.predicate).toBe('(status = \'SCHEDULED\'::"AppointmentStatus")');
    expect(slot?.definition).toMatch(/USING btree \("startsAt"\)/);
    const report = indexes.find((index) => index.name === 'Report_appointmentId_key');
    expect(report).toMatchObject({ tableName: 'Report', unique: true, valid: true, ready: true, predicate: null });
    expect(report?.definition).toMatch(/USING btree \("appointmentId"\)/);
  });

  it('o índice rejeita dois SCHEDULED globais e permite reutilização e cancelados sobrepostos', async () => {
    const db = testPrisma();
    const original = await db.appointment.create({ data: { id: randomUUID(), ...appointmentData } });
    await expect(db.appointment.create({
      data: { id: randomUUID(), ...appointmentData, patientId: QA.brunoId, examTypeId: QA.ultrasoundId },
    })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.appointment.findMany()).toEqual([original]);
    const canceled = await db.appointment.update({
      where: { id: original.id }, data: { status: 'CANCELED', canceledAt: new Date(QA.now) },
    });
    const replacement = await db.appointment.create({
      data: { id: randomUUID(), ...appointmentData, patientId: QA.brunoId },
    });
    const historical = await db.appointment.create({
      data: { id: randomUUID(), ...appointmentData, status: 'CANCELED', canceledAt: new Date(QA.now) },
    });
    const persisted = await db.appointment.findMany({ orderBy: { id: 'asc' } });
    expect(persisted).toEqual([canceled, replacement, historical].sort((left, right) => left.id.localeCompare(right.id)));
    expect(persisted.filter((row) => row.status === 'SCHEDULED')).toHaveLength(1);
    expect(persisted.filter((row) => row.status === 'CANCELED')).toHaveLength(2);
  });

  it('o índice de appointmentId rejeita segundo laudo sem alterar o primeiro', async () => {
    const db = testPrisma();
    const appointment = await db.appointment.create({ data: { id: randomUUID(), ...appointmentData } });
    const report = await db.report.create({ data: {
      id: randomUUID(), appointmentId: appointment.id, ...REPORT_INPUT,
      status: 'DRAFT', publishedAt: null, createdAt: new Date(QA.now), updatedAt: new Date(QA.now),
    } });
    await expect(db.report.create({ data: {
      ...report, id: randomUUID(), title: 'Segundo laudo indevido', status: 'PUBLISHED', publishedAt: new Date(QA.now),
    } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.report.findMany()).toEqual([report]);
    expect(await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toEqual(appointment);
  });
});
