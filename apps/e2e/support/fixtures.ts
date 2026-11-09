import {
  LoginResponseSchema,
  type LoginResponse,
} from '@drlaudo/contract';
import {
  test as base,
  request as requestFactory,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { ClinicApi } from './api.ts';
import { unusedDay } from './dates.ts';
import { API_URL, SESSION_KEY, WEB_URL, storageFile, type Identity } from './qa.ts';

export interface Actor {
  context: BrowserContext;
  page: Page;
  api: ClinicApi;
  session: LoginResponse;
}

interface Fixtures {
  staff: Actor;
  ana: Actor;
  bruno: Actor;
  scenario: { date: string };
}

async function createActor(browser: Browser, identity: Identity, info: TestInfo): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: info.project.use.timezoneId ?? 'America/Sao_Paulo',
    viewport: info.project.use.viewport ?? { width: 1440, height: 1000 },
    isMobile: info.project.use.isMobile ?? false,
    hasTouch: info.project.use.hasTouch ?? false,
    reducedMotion: 'reduce',
    storageState: storageFile(identity),
  });
  try {
    const state = await context.storageState();
    const stored = state.origins.find((origin) => origin.origin === WEB_URL)?.localStorage
      .find((entry) => entry.name === SESSION_KEY)?.value;
    if (!stored) throw new Error(`Sessão QA ausente para ${identity}; execute o projeto setup.`);
    const decoded: unknown = JSON.parse(stored);
    const session = LoginResponseSchema.parse(decoded);
    const request = await requestFactory.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { authorization: `Bearer ${session.token}` },
    });
    return { context, page: await context.newPage(), api: new ClinicApi(request), session };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function withActor(
  browser: Browser,
  identity: Identity,
  info: TestInfo,
  use: (actor: Actor) => Promise<void>,
): Promise<void> {
  const actor = await createActor(browser, identity, info);
  try {
    await use(actor);
  } finally {
    await actor.api.request.dispose();
    await actor.context.close();
  }
}

export const test = base.extend<Fixtures>({
  staff: async ({ browser }, use, info) => withActor(browser, 'staff', info, use),
  ana: async ({ browser }, use, info) => withActor(browser, 'ana', info, use),
  bruno: async ({ browser }, use, info) => withActor(browser, 'bruno', info, use),
  scenario: async ({ staff }, use) => use({ date: await unusedDay(staff.api) }),
});

export { expect } from '@playwright/test';
