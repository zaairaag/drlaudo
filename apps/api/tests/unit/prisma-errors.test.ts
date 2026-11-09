import { describe, expect, it } from 'vitest';
import { isEmailConflict, isReportConflict, isSlotConflict } from '../../src/lib/prisma-errors.ts';

const knownConstraints = [
  { name: 'appointment_active_slot_unique', expected: { slot: true, report: false, email: false } },
  { name: 'Report_appointmentId_key', expected: { slot: false, report: true, email: false } },
  { name: 'User_email_key', expected: { slot: false, report: false, email: true } },
];

describe('P2002 · somente unicidade conhecida recebe erro de domínio', () => {
  it.each(knownConstraints)('reconhece índice exato do adapter: $name', ({ name, expected }) => {
    const error = {
      code: 'P2002',
      meta: { driverAdapterError: { cause: { constraint: { index: name } } } },
    };
    expect({ slot: isSlotConflict(error), report: isReportConflict(error), email: isEmailConflict(error) })
      .toEqual(expected);
  });

  it.each([
    { field: 'startsAt', expected: { slot: true, report: false, email: false } },
    { field: 'appointmentId', expected: { slot: false, report: true, email: false } },
    { field: 'email', expected: { slot: false, report: false, email: true } },
  ])('preserva formato conhecido de target por campo: $field', ({ field, expected }) => {
    const error = { code: 'P2002', meta: { target: [field] } };
    expect({ slot: isSlotConflict(error), report: isReportConflict(error), email: isEmailConflict(error) })
      .toEqual(expected);
  });

  it.each([
    'other_appointment_active_slot_unique_backup',
    'appointment_active_slot_unique_backup',
    'prefix_appointment_active_slot_unique',
    'other_Report_appointmentId_key_backup',
    'Report_appointmentId_key_backup',
    'prefix_Report_appointmentId_key',
    'User_email_key_backup',
    'outra_restricao',
  ])('não transforma nome parecido ou desconhecido em conflito de domínio: %s', (name) => {
    const representations = [
      { code: 'P2002', meta: { driverAdapterError: { cause: { constraint: { index: name } } } } },
      { code: 'P2002', meta: { target: name } },
      { code: 'P2002', message: `Unique constraint failed: constraint: \`${name}\`` },
    ];
    for (const error of representations) {
      expect({ slot: isSlotConflict(error), report: isReportConflict(error), email: isEmailConflict(error) })
        .toEqual({ slot: false, report: false, email: false });
    }
  });

  it.each(['P2003', 'P2025', '23505'])('não reclassifica código %s como P2002 conhecido', (code) => {
    for (const { name } of knownConstraints) {
      const error = { code, meta: { target: name } };
      expect({ slot: isSlotConflict(error), report: isReportConflict(error), email: isEmailConflict(error) })
        .toEqual({ slot: false, report: false, email: false });
    }
  });
});
