import { JwtClaimsSchema, UserSchema } from '@drlaudo/contract';
import { test, expect } from '../support/fixtures.ts';
import { QA, SESSION_KEY } from '../support/qa.ts';
import { apiResponse, signIn, storedSession } from '../support/ui.ts';

// Detecta perda do retorno privado, restauração sem /auth/me e sessão renovada no F5.
test('RF-01/02 · retorno privado, F5 e logout não recuperam conteúdo pelo histórico', async ({ page, scenario }) => {
  await page.goto('/login');
  const target = `/agendamentos/novo?date=${scenario.date}`;
  await page.goto(target);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await signIn(page, QA.staff.email);
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === target);
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agendamento' })).toBeVisible();
  const original = await storedSession(page);
  expect(original?.user.id).toBe(QA.staff.id);
  const me = apiResponse(page, 'GET', '/auth/me');
  await page.reload();
  const restored = await me;
  expect(restored.status()).toBe(200);
  const identity: unknown = await restored.json();
  expect(UserSchema.parse(identity).id).toBe(QA.staff.id);
  await expect(page.getByLabel('Paciente', { exact: true })).toBeEnabled();
  const afterReload = await storedSession(page);
  expect(afterReload?.token === original?.token).toBe(true);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
});

test('RF-01 · credencial inválida preserva e-mail, limpa senha e não simula expiração', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(QA.ana.email);
  await page.getByLabel('Senha', { exact: true }).fill('Qa-incorreta');
  const login = apiResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await login).status()).toBe(401);
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos.' })).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(QA.ana.email);
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  await expect(page.getByText('Sua sessão expirou. Entre novamente.', { exact: true })).toHaveCount(0);
  expect(await storedSession(page)).toBeNull();
});

for (const entry of [
  { identity: 'staff', target: 'https://example.invalid/private', home: '/agenda' },
  { identity: 'staff', target: '/meus-exames', home: '/agenda' },
  { identity: 'ana', target: '/agenda', home: '/meus-exames' },
] as const) {
  test(`RF-01 · retorno inseguro/incompatível ${entry.identity} → ${entry.target}`, async ({ page }) => {
    await page.goto(`/login?${new URLSearchParams({ returnTo: entry.target })}`);
    await signIn(page, QA[entry.identity].email);
    await expect(page).toHaveURL((url) => url.pathname === entry.home);
    expect(new URL(page.url()).origin).not.toBe('https://example.invalid');
  });
}

test('RN-04 · guard de perfil não consulta recursos proibidos', async ({ ana, staff }) => {
  const patientRequests: string[] = [];
  const staffRequests: string[] = [];
  ana.page.on('request', (request) => patientRequests.push(new URL(request.url()).pathname));
  staff.page.on('request', (request) => staffRequests.push(new URL(request.url()).pathname));
  await ana.page.goto('/agenda');
  await expect(ana.page).toHaveURL(/\/meus-exames$/);
  await expect(ana.page.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
  expect(patientRequests.filter((path) => /^\/api\/(appointments|patients|exam-types|slots)(?:\/|$)/.test(path))).toEqual([]);
  await staff.page.goto('/meus-exames');
  await expect(staff.page).toHaveURL(/\/agenda(?:\?|$)/);
  await expect(staff.page.getByRole('heading', { level: 1, name: 'Agenda de exames' })).toBeVisible();
  expect(staffRequests.filter((path) => path.startsWith('/api/me/'))).toEqual([]);
});

test('RF-02 · logout funciona offline e impede restauração pelo histórico', async ({ ana }) => {
  await ana.page.goto('/meus-exames');
  await expect(ana.page.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
  await ana.context.setOffline(true);
  try {
    await ana.page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(ana.page).toHaveURL(/\/login(?:\?|$)/);
    expect(await storedSession(ana.page)).toBeNull();
    await ana.page.goBack();
    await expect(ana.page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
  } finally {
    await ana.context.setOffline(false);
  }
});

test('RF-02 · expiração local de JWT real limpa sessão e dados sem alterar relógio da API', async ({ ana }) => {
  await ana.page.goto('/meus-exames');
  await expect(ana.page.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
  const payload = ana.session.token.split('.')[1];
  if (!payload) throw new Error('JWT real QA sem payload.');
  const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const claims = JwtClaimsSchema.parse(decoded);
  // Date-only emulation leaves browser/driver timers running; the API uses systemClock.
  await ana.page.clock.setFixedTime(new Date(claims.exp * 1000 + 1_000));
  await ana.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(ana.page).toHaveURL(/\/login(?:\?|$)/);
  await expect(ana.page.getByText('Sua sessão expirou. Entre novamente.', { exact: true })).toBeVisible();
  expect(await storedSession(ana.page)).toBeNull();
  await expect(ana.page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
  expect((await ana.api.request.get('/auth/me')).status()).toBe(200);
});

test('RF-01 · atalho demonstrativo só preenche, sem autenticar nem depender do seed demo', async ({ page }) => {
  const loginRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/login') loginRequests.push(request.url());
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /^Equipe\b/ }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('equipe@drlaudo.test');
  await expect(page.getByLabel('Senha', { exact: true })).not.toHaveValue('');
  await expect(page).toHaveURL(/\/login$/);
  expect(loginRequests).toEqual([]);
  expect(await storedSession(page)).toBeNull();
});
