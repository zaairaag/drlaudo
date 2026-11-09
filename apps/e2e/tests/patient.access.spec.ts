import { randomUUID } from 'node:crypto';
import { ErrorResponseSchema } from '@drlaudo/contract';
import { test, expect } from '../support/fixtures.ts';
import { displayDate, slotAt } from '../support/dates.ts';
import { QA, SESSION_KEY } from '../support/qa.ts';
import { apiResponse, expectNoHorizontalOverflow } from '../support/ui.ts';

const visibleReport = {
  title: 'Resultado publicado QA da Ana',
  body: 'Resultado fictício exclusivo da Ana QA.\nQuebra de linha mantida no leitor.',
  professionalName: 'Dra. Exclusiva QA',
};

test('cenários 2 e 3: quatro 404 idênticos e nenhum indício de rascunho em DTO/DOM/rede', async ({ staff, ana, bruno, scenario }) => {
  const without = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 0));
  const withDraft = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 1));
  const ownPublished = await staff.api.createAppointment(QA.ana.id, QA.ultrasound.id, slotAt(scenario.date, 2));
  const foreign = await staff.api.createAppointment(QA.bruno.id, QA.mri.id, slotAt(scenario.date, 3));
  const draft = await staff.api.createReport(withDraft.id, {
    title: 'SENTINELA-RASCUNHO-E2E', body: 'CORPO-PRIVADO-E2E não pode chegar ao paciente.', professionalName: 'PROFISSIONAL-PRIVADO-E2E',
  });
  const ownReport = await staff.api.createReport(ownPublished.id, visibleReport);
  await staff.api.publish(ownReport.id);
  const foreignDraft = await staff.api.createReport(foreign.id, { title: 'Resultado Bruno QA', body: 'Texto exclusivo do Bruno QA para isolamento.', professionalName: 'Dr. Bruno QA' });
  await staff.api.publish(foreignDraft.id);

  const cases = [foreign.id, randomUUID(), without.id, withDraft.id];
  const directBodies: string[] = [];
  for (const id of cases) {
    const result = await ana.api.request.get(`/me/appointments/${id}/report`);
    expect(result.status()).toBe(404);
    directBodies.push(await result.text());
  }
  expect(new Set(directBodies).size).toBe(1);
  const opaque: unknown = JSON.parse(directBodies[0] ?? 'null');
  expect(ErrorResponseSchema.parse(opaque)).toEqual({ error: { code: 'NOT_FOUND', message: 'Não encontramos este registro' } });
  const deniedBruno = await bruno.api.request.get(`/me/appointments/${ownPublished.id}/report`);
  expect(deniedBruno.status()).toBe(404);
  expect(await deniedBruno.text()).toBe(directBodies[0]);

  const network: Promise<string>[] = [];
  ana.page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/')) network.push(response.text());
  });
  const list = apiResponse(ana.page, 'GET', '/me/appointments');
  await ana.page.goto('/meus-exames');
  expect((await list).status()).toBe(200);
  await expect(ana.page.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
  const mine = await ana.api.mine();
  expect(mine.find((item) => item.id === without.id)).toMatchObject({ hasPublishedReport: false });
  expect(mine.find((item) => item.id === withDraft.id)).toMatchObject({ hasPublishedReport: false });
  expect(mine.find((item) => item.id === ownPublished.id)).toMatchObject({ hasPublishedReport: true });
  expect(mine.some((item) => item.id === foreign.id)).toBe(false);
  for (const appointment of [without, withDraft]) {
    const item = ana.page.getByRole('article').filter({ has: ana.page.locator(`time[datetime="${appointment.startsAt}"]`) });
    await expect(item.getByText('Agendado', { exact: true })).toBeVisible();
    await expect(item.getByText('Laudo disponível', { exact: true })).toHaveCount(0);
    await expect(item.getByRole('link')).toHaveCount(0);
  }
  await expect(ana.page.getByText(/rascunho/i)).toHaveCount(0);
  await expect(ana.page.getByText(QA.bruno.name, { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(ana.page);

  const uiBodies: string[] = [];
  const unavailableScreens: string[] = [];
  for (const id of cases) {
    const report = apiResponse(ana.page, 'GET', `/me/appointments/${id}/report`);
    await ana.page.goto(`/meus-exames/${id}/laudo`);
    const result = await report;
    expect(result.status()).toBe(404);
    uiBodies.push(await result.text());
    await expect(ana.page.getByRole('heading', { name: 'Não encontramos este registro', exact: true })).toBeVisible();
    unavailableScreens.push(await ana.page.getByRole('main').innerText());
    await expect(ana.page.getByRole('link', { name: 'Voltar para meus exames', exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(ana.page);
  }
  expect(uiBodies).toEqual(directBodies);
  expect(new Set(unavailableScreens).size).toBe(1);
  const observed = (await Promise.all(network)).join('\n');
  for (const forbidden of [draft.id, draft.title, draft.body, draft.professionalName, 'passwordHash', '"DRAFT"', foreignDraft.id]) {
    expect(observed).not.toContain(forbidden);
  }
  await bruno.page.goto(`/meus-exames/${ownPublished.id}/laudo`);
  await expect(bruno.page.getByRole('heading', { name: 'Não encontramos este registro', exact: true })).toBeVisible();
  await expect(bruno.page.getByText(visibleReport.body, { exact: true })).toHaveCount(0);
});

test('cenário 4: publicação real aparece no foco e leitor exibe só versão publicada própria', async ({ staff, ana, bruno, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, visibleReport);
  await ana.page.goto('/meus-exames');
  const item = ana.page.getByRole('article').filter({ has: ana.page.locator(`time[datetime="${appointment.startsAt}"]`) });
  await expect(item).toBeVisible();
  await expect(item.getByRole('link')).toHaveCount(0);
  const published = await staff.api.publish(draft.id);
  expect(published.status).toBe('PUBLISHED');
  const refetch = apiResponse(ana.page, 'GET', '/me/appointments');
  // Real focus event exercises setupListeners; no reload, polling, route interception or cache edits.
  await ana.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await refetch).status()).toBe(200);
  await expect(item.getByText('Laudo disponível', { exact: true })).toBeVisible();
  await item.getByRole('link', { name: `Ver laudo do exame ${QA.xray.name}`, exact: true }).click();
  await expect(ana.page).toHaveURL(new RegExp(`/meus-exames/${appointment.id}/laudo$`));
  await expect(ana.page.getByRole('heading', { level: 1, name: visibleReport.title, exact: true })).toBeVisible();
  await expect(ana.page.getByText(visibleReport.body, { exact: true })).toBeVisible();
  await expect(ana.page.getByText(visibleReport.professionalName, { exact: true })).toBeVisible();
  await expect(ana.page.getByText('Data do exame', { exact: true })).toBeVisible();
  await expect(ana.page.getByText(`${displayDate(scenario.date)} às 10:00`, { exact: true })).toBeVisible();
  await expect(ana.page.getByText('Publicado em', { exact: true })).toBeVisible();
  await expect(ana.page.getByText('Horário de Brasília', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(ana.page);
  const dto = await ana.api.published(appointment.id);
  expect(dto).toEqual({ ...visibleReport, examType: { name: QA.xray.name }, startsAt: appointment.startsAt, publishedAt: published.publishedAt });
  expect((await bruno.api.request.get(`/me/appointments/${appointment.id}/report`)).status()).toBe(404);
  await ana.page.reload();
  await expect(ana.page.getByRole('heading', { level: 1, name: visibleReport.title, exact: true })).toBeVisible();
  await expect(ana.page.getByLabel('Texto do laudo', { exact: true })).toHaveCount(0);
});

test('RF-02/RN-24 · troca para sessão real de Bruno em outra aba elimina laudo/cache de Ana', async ({ staff, ana, bruno, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, { ...visibleReport, body: 'CONTEÚDO ANA E2E não pode sobreviver à troca de identidade.' });
  await staff.api.publish(draft.id);
  await ana.page.goto(`/meus-exames/${appointment.id}/laudo`);
  await expect(ana.page.getByText(draft.body, { exact: true })).toBeVisible();
  const otherTab = await ana.context.newPage();
  try {
    await otherTab.goto('/meus-exames');
    await expect(otherTab.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
    // This is Bruno's genuine login response from auth.setup, never a forged role/token.
    await otherTab.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: SESSION_KEY, session: bruno.session });
    await expect(ana.page.getByText(draft.body, { exact: true })).toHaveCount(0);
    await expect(ana.page).toHaveURL(/\/meus-exames$/);
    await expect(ana.page.getByRole('heading', { level: 1, name: 'Meus exames' })).toBeVisible();
    await ana.page.goto(`/meus-exames/${appointment.id}/laudo`);
    await expect(ana.page.getByRole('heading', { name: 'Não encontramos este registro', exact: true })).toBeVisible();
    await ana.page.getByRole('link', { name: 'Voltar para meus exames', exact: true }).first().click();
    await expect(ana.page.locator(`a[href="/meus-exames/${appointment.id}/laudo"]`)).toHaveCount(0);
    await ana.page.goBack();
    await expect(ana.page.getByText(draft.body, { exact: true })).toHaveCount(0);
  } finally {
    await otherTab.close();
  }
});
