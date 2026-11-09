import { mkdir } from 'node:fs/promises';
import { UserSchema } from '@drlaudo/contract';
import { test, expect } from '@playwright/test';
import { QA, authDirectory, storageFile, type Identity } from '../support/qa.ts';
import { apiResponse, loginAs, storedSession } from '../support/ui.ts';

for (const identity of ['staff', 'ana', 'bruno'] as const satisfies readonly Identity[]) {
  test(`autenticação QA isolada: ${identity}`, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error('baseURL obrigatória para autenticação QA.');
    await mkdir(authDirectory, { recursive: true });
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const session = await loginAs(page, identity);
      expect(session.user.id).toBe(QA[identity].id);
      expect(session.user.role).toBe(identity === 'staff' ? 'STAFF' : 'PATIENT');
      await expect(page).toHaveURL(identity === 'staff' ? /\/agenda(?:\?|$)/ : /\/meus-exames$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(identity === 'staff' ? 'Agenda de exames' : 'Meus exames');
      const restored = apiResponse(page, 'GET', '/auth/me');
      await page.reload();
      const response = await restored;
      expect(response.status()).toBe(200);
      const body: unknown = await response.json();
      expect(UserSchema.parse(body).id).toBe(QA[identity].id);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const persisted = await storedSession(page);
      expect(persisted?.user.id).toBe(QA[identity].id);
      expect(persisted?.token === session.token).toBe(true);
      expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
      await context.storageState({ path: storageFile(identity) });
    } finally {
      await context.close();
    }
  });
}
