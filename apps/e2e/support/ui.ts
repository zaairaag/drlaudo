import { LoginResponseSchema, type LoginResponse } from '@drlaudo/contract';
import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { QA, SESSION_KEY, type Identity } from './qa.ts';

export function apiResponse(page: Page, method: string, path: string): Promise<Response> {
  return page.waitForResponse((response) => response.request().method() === method
    && new URL(response.url()).pathname === `/api${path}`);
}

export async function signIn(page: Page, email: string, password: string = QA.password): Promise<LoginResponse> {
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  const response = apiResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const received = await response;
  expect(received.status()).toBe(200);
  const data: unknown = await received.json();
  return LoginResponseSchema.parse(data);
}

export async function loginAs(page: Page, identity: Identity): Promise<LoginResponse> {
  await page.goto('/login');
  return signIn(page, QA[identity].email);
}

export async function storedSession(page: Page): Promise<LoginResponse | null> {
  const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  if (!stored) return null;
  const decoded: unknown = JSON.parse(stored);
  return LoginResponseSchema.parse(decoded);
}

export function appointmentItem(page: Page, id: string): Locator {
  return page.locator(`[data-appointment-id="${id}"]:visible`);
}

export function reportHref(id: string, date?: string, patientId?: string): string {
  const query = new URLSearchParams({ ...(date ? { date } : {}), ...(patientId ? { patientId } : {}) });
  return `/agendamentos/${id}/laudo${query.size ? `?${query}` : ''}`;
}

export async function fillReport(page: Page, values: { title: string; body: string; professionalName: string }): Promise<void> {
  await page.getByLabel('Título', { exact: true }).fill(values.title);
  await page.getByLabel('Texto do laudo', { exact: true }).fill(values.body);
  await page.getByLabel('Profissional responsável', { exact: true }).fill(values.professionalName);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
}
