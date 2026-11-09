import { describe, expect, it } from 'vitest';
import { loadEnv, testDatabaseUrl } from '../../src/env.ts';

const primary = 'postgresql://qa:password@127.0.0.1:5433/drlaudo';
const disposable = 'postgresql://qa:password@127.0.0.1:5433/drlaudo_test';

function configuration(testUrl: string, databaseUrl = primary, nodeEnv = 'test') {
  return loadEnv({
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: testUrl,
    JWT_SECRET: 'qa-secret-with-at-least-32-characters!!',
    NODE_ENV: nodeEnv,
  });
}

describe('guarda de QA · validação pura, sem conexão de banco', () => {
  it.each([
    disposable,
    'postgres://qa:password@127.0.0.1:5433/drlaudo_test',
    `${disposable}?schema=public&application_name=qa`,
    'postgresql://qa:password@127.0.0.1:5433/%64rlaudo_test',
  ])('aceita somente o pathname QA estrutural: %s', (url) => {
    expect(testDatabaseUrl(configuration(url))).toBe(url);
  });

  it.each([
    `${primary}?redirect=/drlaudo_test`,
    `${primary}?dbname=drlaudo_test`,
    `${primary}?database=drlaudo_test`,
    `${primary}?x=/drlaudo_test?schema=public`,
    `${disposable}_backup`,
    `${disposable}/`,
    `${disposable}%2F`,
    `${disposable}%00`,
    'postgresql://qa:password@127.0.0.1:5433/%2564rlaudo_test',
    'postgresql://qa:password@127.0.0.1:5433/%ZZdrlaudo_test',
    'https://127.0.0.1/drlaudo_test',
    'file:///drlaudo_test',
    'socket:/drlaudo_test',
    '/drlaudo_test',
    'nao-e-url',
    'postgresql://[invalido/drlaudo_test',
    'postgresql:///drlaudo_test',
    `${disposable}#outra-base`,
    `${disposable}?dbname=drlaudo`,
    `${disposable}?database=drlaudo`,
    `${disposable}?host=producao`,
    `${disposable}?port=5432`,
    `${disposable}?user=admin`,
    `${disposable}?options=-c%20search_path%3Dprivado`,
    `${disposable}?connectionString=postgresql%3A%2F%2Fqa%3Apassword%40producao%2Fdrlaudo`,
    `${disposable}?connection%53tring=postgresql%3A%2F%2Fqa%3Apassword%40producao%2Fdrlaudo`,
  ])('rejeita alvo ambíguo ou fora de QA antes de conectar: %s', (url) => {
    expect(() => testDatabaseUrl(configuration(url))).toThrow();
  });

  it('permite um único banco descartável apenas em NODE_ENV=test', () => {
    expect(testDatabaseUrl(configuration(disposable, disposable))).toBe(disposable);
    const alias = 'postgres://outro:password@localhost:5433/%64rlaudo_test?schema=public';
    expect(testDatabaseUrl(configuration(alias, disposable))).toBe(alias);
    for (const nodeEnv of ['development', 'production']) {
      expect(() => testDatabaseUrl(configuration(disposable, disposable, nodeEnv))).toThrow();
      expect(() => testDatabaseUrl(configuration(alias, disposable, nodeEnv))).toThrow();
    }
  });

  it('não permite usar query na base principal como prova de banco descartável', () => {
    expect(() => testDatabaseUrl(configuration(disposable, `${primary}?x=/drlaudo_test`, 'production')))
      .toThrow();
  });

  it('não revela usuário, senha ou URL em erros de configuração', () => {
    const secretUrl = 'postgresql://usuario-secreto:senha-secreta@host/drlaudo?x=/drlaudo_test';
    expect(() => testDatabaseUrl(configuration(secretUrl))).toThrow();
    try {
      testDatabaseUrl(configuration(secretUrl));
    } catch (error) {
      expect(String(error)).not.toContain('usuario-secreto');
      expect(String(error)).not.toContain('senha-secreta');
      expect(String(error)).not.toContain(secretUrl);
    }
  });
});
