import { describe, expect, it } from 'vitest';
import { CreatePatientRequestSchema, UpdatePatientRequestSchema } from '../src/index.js';

const input = { name: 'Paciente QA', email: 'paciente@qa.test', password: 'Qa@12345' };

describe('contrato de administração de pacientes', () => {
  it('normaliza nome/e-mail e preserva senha literal', () => {
    expect(CreatePatientRequestSchema.parse({ name: ' Paciente QA ', email: ' PACIENTE@QA.TEST ', password: ' 123456 ' }))
      .toEqual({ ...input, password: ' 123456 ' });
  });

  it.each([
    { name: ' a ' }, { name: '😀'.repeat(61) }, { name: null }, { name: 1 },
    { email: 'paciente' }, { email: null }, { password: '1234567' },
    { password: 'é'.repeat(37) }, { password: '😀'.repeat(19) },
    { role: 'STAFF' }, { passwordHash: 'hash' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  ])('rejeita criação fora da capacidade administrativa: %j', (override) => {
    expect(CreatePatientRequestSchema.safeParse({ ...input, ...override }).success).toBe(false);
  });

  it('limita nome/senha mínimo em UTF-16 e máximo da senha em bytes UTF-8', () => {
    expect(CreatePatientRequestSchema.safeParse({ ...input, name: '😀'.repeat(60), password: '😀'.repeat(4) }).success)
      .toBe(true);
    expect(CreatePatientRequestSchema.safeParse({ ...input, password: 'é'.repeat(36) }).success).toBe(true);
    expect(CreatePatientRequestSchema.safeParse({ ...input, password: 'a'.repeat(72) }).success).toBe(true);
    const tooLong = CreatePatientRequestSchema.safeParse({ ...input, password: 'a'.repeat(73) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.issues).toContainEqual(expect.objectContaining({
        code: 'custom', path: ['password'], params: { rule: 'TOO_LONG' },
      }));
    }
  });

  it.each([{ name: ' Nome Atual ' }, { email: ' OUTRO@QA.TEST ' }])('permite patch parcial válido: %j', (patch) => {
    const output = UpdatePatientRequestSchema.parse(patch);
    expect(Object.keys(output)).toEqual(Object.keys(patch));
    expect(output).toEqual(patch.name ? { name: 'Nome Atual' } : { email: 'outro@qa.test' });
  });

  it.each([{}, { name: undefined }, { email: undefined }, { password: 'Nova@1234' }, { role: 'STAFF' }, null, []])(
    'rejeita patch vazio, undefined explícito ou mudança de credenciais/perfil: %j', (patch) => {
      expect(UpdatePatientRequestSchema.safeParse(patch).success).toBe(false);
    },
  );
});
