import { StaffReportSchema } from '@drlaudo/contract';
import { test, expect } from '../support/fixtures.ts';
import { expectApiError } from '../support/api.ts';
import { slotAt, unusedDay } from '../support/dates.ts';
import { QA, SESSION_KEY } from '../support/qa.ts';
import { apiResponse, appointmentItem, fillReport, reportHref } from '../support/ui.ts';

const savedValues = {
  title: 'Laudo QA revisado',
  body: 'Resultado fictício QA confirmado.\nSegunda linha preservada literalmente.',
  professionalName: 'Dra. Responsável QA',
};

test('RF-06/07 · URL/F5, criação, revisão salva e publicação explícita imutável de exame futuro', async ({ staff }) => {
  const date = await unusedDay(staff.api, 45);
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(date, 6));
  const page = staff.page;
  const mutations: { method: string; path: string; body: string | null }[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (['POST', 'PATCH'].includes(request.method()) && /\/(report|reports)(?:\/|$)/.test(path)) {
      mutations.push({ method: request.method(), path, body: request.postData() });
    }
  });
  await page.goto(reportHref(appointment.id, date, QA.ana.id));
  await expect(page.getByRole('heading', { level: 1, name: 'Criar laudo' })).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('');
  await fillReport(page, {
    title: '  Laudo QA inicial  ',
    body: '  Primeira versão fictícia para revisão QA.  ',
    professionalName: '  Dra. Responsável QA  ',
  });
  const creation = apiResponse(page, 'POST', `/appointments/${appointment.id}/report`);
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  const response = await creation;
  expect(response.status()).toBe(201);
  const data: unknown = await response.json();
  const draft = StaffReportSchema.parse(data);
  expect(draft).toMatchObject({ title: 'Laudo QA inicial', body: 'Primeira versão fictícia para revisão QA.', professionalName: 'Dra. Responsável QA', status: 'DRAFT', publishedAt: null });
  await expect(page.getByRole('heading', { level: 1, name: 'Editar laudo' })).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Laudo QA inicial');
  await fillReport(page, savedValues);
  await expect(page.getByText('Alterações não salvas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
  await expect(page.getByText('Salve o rascunho antes de publicar.', { exact: true })).toBeVisible();
  expect(mutations.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: 'POST', path: `/api/appointments/${appointment.id}/report` },
  ]);
  const patch = apiResponse(page, 'PATCH', `/reports/${draft.id}`);
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  expect((await patch).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeEnabled();
  expect(await staff.api.report(appointment.id)).toMatchObject({ ...savedValues, id: draft.id, status: 'DRAFT' });
  await page.reload();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue(savedValues.body);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Publicar laudo?' });
  await expect(dialog.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
  const review = dialog.getByRole('region', { name: 'Rascunho salvo para revisão' });
  await expect(review.getByText(savedValues.title, { exact: true })).toBeVisible();
  await expect(review.getByText(savedValues.body, { exact: true })).toBeVisible();
  await expect(review.getByText(savedValues.professionalName, { exact: true })).toBeVisible();
  await expect(review.getByText(QA.ana.name, { exact: true })).toBeVisible();
  await expect(review.getByText(QA.xray.name, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  expect((await staff.api.report(appointment.id)).status).toBe('DRAFT');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(mutations.filter((mutation) => mutation.path.endsWith('/publish'))).toEqual([]);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const publication = apiResponse(page, 'POST', `/reports/${draft.id}/publish`);
  await dialog.getByRole('button', { name: 'Publicar laudo', exact: true }).click();
  const publishedResponse = await publication;
  expect(publishedResponse.status()).toBe(200);
  const publishedValue: unknown = await publishedResponse.json();
  const published = StaffReportSchema.parse(publishedValue);
  expect(published.status).toBe('PUBLISHED');
  expect(published.publishedAt).not.toBeNull();
  expect(mutations.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: 'POST', path: `/api/appointments/${appointment.id}/report` },
    { method: 'PATCH', path: `/api/reports/${draft.id}` },
    { method: 'POST', path: `/api/reports/${draft.id}/publish` },
  ]);
  expect(mutations.at(-1)?.body).toBeNull();
  await expect(page.getByText('Este laudo foi publicado e não pode ser alterado.', { exact: true })).toBeVisible();
  await expect(page.getByText('Publicado em', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(savedValues.body, { exact: true })).toBeVisible();
  await expect(page.getByText(QA.ana.name, { exact: true })).toBeVisible();
  await expectApiError(await staff.api.request.patch(`/reports/${draft.id}`, { data: { title: 'Mudança proibida QA' } }), 409, 'REPORT_LOCKED');
  expect(await staff.api.report(appointment.id)).toEqual(published);
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/agenda' && url.searchParams.get('date') === date && url.searchParams.get('patientId') === QA.ana.id);
  await expect(appointmentItem(page, appointment.id).getByRole('button', { name: /Cancelar agendamento/ })).toHaveCount(0);
});

test('RF-06 · dirty exige descarte, preserva filtros e F5 usa aviso nativo sem persistir texto', async ({ staff, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, savedValues);
  const page = staff.page;
  await page.goto(`/agenda?${new URLSearchParams({ date: scenario.date, patientId: QA.ana.id })}`);
  await appointmentItem(page, appointment.id).getByRole('link', { name: 'Editar laudo', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(draft.title);
  await page.getByLabel('Texto do laudo', { exact: true }).fill('EDIÇÃO QA NÃO SALVA: não pode sair nem ir ao storage.');
  const back = page.getByRole('link', { name: 'Voltar para agenda', exact: true });
  await back.click();
  const discard = page.getByRole('alertdialog', { name: 'Descartar alterações?' });
  await expect(discard.getByRole('button', { name: 'Continuar editando', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(discard).toHaveCount(0);
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue('EDIÇÃO QA NÃO SALVA: não pode sair nem ir ao storage.');
  await back.click();
  await discard.getByRole('button', { name: 'Continuar editando', exact: true }).click();
  await expect(back).toBeFocused();
  await page.getByRole('button', { name: 'Recarregar rascunho', exact: true }).click();
  const reloadDialog = page.getByRole('alertdialog', { name: 'Descartar alterações?' });
  await reloadDialog.getByRole('button', { name: 'Descartar e recarregar', exact: true }).click();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue(savedValues.body);
  const textarea = page.getByLabel('Texto do laudo', { exact: true });
  await textarea.click();
  await textarea.fill('EDIÇÃO QA NÃO SALVA: não pode sair nem ir ao storage.');
  await page.keyboard.press('Space');
  const native = page.waitForEvent('dialog');
  void page.evaluate(() => { window.location.reload(); });
  const nativeDialog = await native;
  expect(nativeDialog.type()).toBe('beforeunload');
  await nativeDialog.dismiss();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue('EDIÇÃO QA NÃO SALVA: não pode sair nem ir ao storage. ');
  const persisted = await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
  expect(JSON.stringify(persisted)).not.toContain('EDIÇÃO QA NÃO SALVA');
  expect(persisted.local.map(([key]) => key)).toEqual([SESSION_KEY]);
  await back.click();
  await discard.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/agenda' && url.searchParams.get('date') === scenario.date && url.searchParams.get('patientId') === QA.ana.id);
  expect(await staff.api.report(appointment.id)).toEqual(draft);
});

test('RF-06/07 · publicação concorrente preserva edição não salva em memória e protege descarte', async ({ staff, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, savedValues);
  const page = staff.page;
  await page.goto(reportHref(appointment.id, scenario.date, QA.ana.id));
  await page.getByLabel('Texto do laudo', { exact: true }).fill('EDIÇÃO LOCAL QA preservada depois de REPORT_LOCKED.');
  const canonical = await staff.api.publish(draft.id);
  const conflict = apiResponse(page, 'PATCH', `/reports/${draft.id}`);
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByText('EDIÇÃO LOCAL QA preservada depois de REPORT_LOCKED.', { exact: true })).toBeVisible();
  await expect(page.getByText(savedValues.body, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveCount(0);
  expect(await staff.api.report(appointment.id)).toEqual(canonical);
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Descartar alterações?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Continuar editando', exact: true }).click();
  await expect(page.getByText('EDIÇÃO LOCAL QA preservada depois de REPORT_LOCKED.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await discard.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\?/);
});

test('RF-06 · rede indisponível não salva nem perde edição ao reconciliar leituras reais', async ({ staff, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, savedValues);
  const page = staff.page;
  await page.goto(reportHref(appointment.id, scenario.date));
  await page.getByLabel('Texto do laudo', { exact: true }).fill('EDIÇÃO QA para preservar durante indisponibilidade real da rede.');
  await staff.context.setOffline(true);
  try {
    const failed = page.waitForEvent('requestfailed', (request) => request.method() === 'PATCH'
      && new URL(request.url()).pathname === `/api/reports/${draft.id}`);
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await failed;
    await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
    await expect(page.getByText('Rascunho salvo.', { exact: true })).toHaveCount(0);
    expect(await staff.api.report(appointment.id)).toEqual(draft);
  } finally {
    await staff.context.setOffline(false);
  }
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  if (await retry.isVisible()) {
    await retry.click().catch(() => undefined);
  }
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue('EDIÇÃO QA para preservar durante indisponibilidade real da rede.');
  await expect(page.getByText('Alterações não salvas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
  expect(await staff.api.report(appointment.id)).toEqual(draft);
  const save = apiResponse(page, 'PATCH', `/reports/${draft.id}`);
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  expect((await save).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeEnabled();
  expect((await staff.api.report(appointment.id)).body).toBe('EDIÇÃO QA para preservar durante indisponibilidade real da rede.');
});
