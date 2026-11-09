import { test, expect } from '../support/fixtures.ts';
import { auditAccessibility, expectControlVisibleWithoutScrolling, expectControlWithinViewport, expectFocusTrap } from '../support/accessibility.ts';
import { slotAt } from '../support/dates.ts';
import { QA } from '../support/qa.ts';
import { appointmentItem, expectNoHorizontalOverflow, reportHref } from '../support/ui.ts';

const report = {
  title: 'Laudo QA para acessibilidade',
  body: 'Resultado fictício para teste de leitura e navegação por teclado.',
  professionalName: 'Dra. Acessibilidade QA',
};
const longBody = Array.from({ length: 100 }, (_, index) => `Linha ${index + 1}: resultado fictício QA para revisão acessível e literal.`).join('\n');

test('a11y · login e erro associado são operáveis por teclado sem violações axe', async ({ page }) => {
  await page.goto('/login');
  await auditAccessibility(page);
  await page.getByLabel('E-mail', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeFocused();
  await auditAccessibility(page);
});

test('a11y · agenda/formulário/administração e erros reais passam axe e mantêm foco útil', async ({ staff, scenario }) => {
  test.setTimeout(120_000);
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const page = staff.page;
  await page.goto(`/agenda?date=${scenario.date}`);
  await expect(appointmentItem(page, appointment.id)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo', exact: true });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await auditAccessibility(page);
  await page.goto(`/agendamentos/novo?date=${scenario.date}`);
  await expect(page.getByRole('button', { name: '10:00, ocupado', exact: true })).toBeDisabled();
  await auditAccessibility(page);
  await page.getByRole('button', { name: 'Agendar exame', exact: true }).click();
  await expect(page.getByLabel('Paciente', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await auditAccessibility(page);
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.ana.id);
  await page.getByLabel('Exame', { exact: true }).selectOption(QA.xray.id);
  await page.getByRole('button', { name: '10:30, disponível', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '10:30, disponível', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/pacientes');
  await expect(page.locator(`[data-patient-id="${QA.ana.id}"]:visible`)).toBeVisible();
  await auditAccessibility(page);
  const trigger = page.getByRole('button', { name: 'Novo paciente', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Novo paciente', exact: true });
  await expect(dialog.getByLabel('Nome', { exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  await expect(dialog.getByLabel('Nome', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await auditAccessibility(page);
  await expectFocusTrap(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const editTrigger = page.locator(`[data-patient-id="${QA.ana.id}"]:visible`).getByRole('button', { name: 'Editar paciente', exact: true });
  await editTrigger.click();
  const editDialog = page.getByRole('dialog', { name: 'Editar paciente', exact: true });
  await expect(editDialog.getByLabel('Nome', { exact: true })).toHaveValue(QA.ana.name);
  await auditAccessibility(page);
  await page.keyboard.press('Escape');
  await expect(editTrigger).toBeFocused();
});

test('a11y · editor, descarte, cancelamento e revisão longa mantêm foco e ações alcançáveis', async ({ staff, scenario }) => {
  test.setTimeout(120_000);
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  await staff.api.createReport(appointment.id, { ...report, body: longBody });
  const page = staff.page;
  await page.goto(reportHref(appointment.id, scenario.date));
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveValue(longBody);
  await auditAccessibility(page);
  await page.getByLabel('Título', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Título', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await auditAccessibility(page);
  await page.getByRole('button', { name: 'Recarregar rascunho', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Descartar alterações?' });
  await expect(discard.getByRole('button', { name: 'Continuar editando', exact: true })).toBeFocused();
  await auditAccessibility(page);
  await expectFocusTrap(page, discard);
  await discard.getByRole('button', { name: 'Descartar e recarregar', exact: true }).click();
  const publish = page.getByRole('button', { name: 'Publicar', exact: true });
  await expect(publish).toBeEnabled();
  await publish.focus();
  await page.keyboard.press('Enter');
  const reviewDialog = page.getByRole('alertdialog', { name: 'Publicar laudo?' });
  await expect(reviewDialog.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
  await auditAccessibility(page);
  await expectFocusTrap(page, reviewDialog);
  const review = reviewDialog.getByRole('region', { name: 'Rascunho salvo para revisão' });
  await review.focus();
  await page.keyboard.press('End');
  await expectControlWithinViewport(reviewDialog.getByRole('button', { name: 'Publicar laudo', exact: true }));
  await expectControlWithinViewport(reviewDialog.getByRole('button', { name: 'Voltar', exact: true }));
  expect(await review.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(publish).toBeFocused();
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  const cancel = appointmentItem(page, appointment.id).getByRole('button', { name: `Cancelar agendamento de ${QA.ana.name}`, exact: true });
  await cancel.focus();
  await page.keyboard.press('Enter');
  const cancelDialog = page.getByRole('alertdialog', { name: 'Cancelar este agendamento?' });
  await expect(cancelDialog.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
  await auditAccessibility(page);
  await expectFocusTrap(page, cancelDialog);
  await page.keyboard.press('Escape');
  await expect(cancel).toBeFocused();
  expect((await staff.api.appointment(appointment.id)).status).toBe('SCHEDULED');
});

for (const layout of [
  { name: 'viewport 375 px', viewport: { width: 375, height: 812 }, zoom: 1 },
  { name: 'zoom 200% (reflow equivalente 720 px)', viewport: { width: 720, height: 900 }, zoom: 1 },
] as const) {
  test(`a11y · ${layout.name}: sem corte horizontal, teclado e ações disponíveis`, async ({ page, staff, ana, scenario }) => {
    test.setTimeout(120_000);
    const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
    const draft = await staff.api.createReport(appointment.id, { ...report, body: longBody });
    const applyLayout = async (target: typeof page) => {
      await target.setViewportSize(layout.viewport);
      await target.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, layout.zoom);
      expect(await target.evaluate(() => Number(getComputedStyle(document.documentElement).zoom))).toBe(layout.zoom);
    };
    await page.goto('/login');
    await applyLayout(page);
    await expectNoHorizontalOverflow(page);
    await expectControlWithinViewport(page.getByLabel('E-mail', { exact: true }));
    await expectControlWithinViewport(page.getByRole('button', { name: 'Entrar', exact: true }));
    await staff.page.goto(`/agenda?date=${scenario.date}`);
    await applyLayout(staff.page);
    await expect(appointmentItem(staff.page, appointment.id)).toBeVisible();
    await expectNoHorizontalOverflow(staff.page);
    await staff.page.goto(`/agendamentos/novo?date=${scenario.date}`);
    await applyLayout(staff.page);
    await expect(staff.page.getByRole('button', { name: '10:00, ocupado', exact: true })).toBeDisabled();
    await expectNoHorizontalOverflow(staff.page);
    await expectControlWithinViewport(staff.page.getByRole('button', { name: 'Agendar exame', exact: true }));
    await staff.page.goto('/pacientes');
    await applyLayout(staff.page);
    await staff.page.getByRole('button', { name: 'Novo paciente', exact: true }).click();
    const patientDialog = staff.page.getByRole('dialog', { name: 'Novo paciente', exact: true });
    await expectControlWithinViewport(patientDialog.getByLabel('Nome', { exact: true }));
    await expectControlWithinViewport(patientDialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }));
    await expectNoHorizontalOverflow(staff.page);
    await staff.page.keyboard.press('Escape');
    await staff.page.goto(reportHref(appointment.id, scenario.date));
    await applyLayout(staff.page);
    await expect(staff.page.getByLabel('Texto do laudo', { exact: true })).toHaveValue(longBody);
    const actions = staff.page.getByRole('group', { name: 'Ações do laudo', exact: true });
    const save = actions.getByRole('button', { name: 'Salvar rascunho', exact: true });
    const publish = actions.getByRole('button', { name: 'Publicar', exact: true });
    await staff.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expectControlVisibleWithoutScrolling(save);
    await expectControlVisibleWithoutScrolling(publish);
    const initialActions = await actions.boundingBox();
    if (!initialActions) throw new Error('Barra de ações ausente no editor QA.');
    await staff.page.getByLabel('Texto do laudo', { exact: true }).evaluate((field) => { field.scrollTop = field.scrollHeight; });
    await staff.page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => staff.page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expectControlVisibleWithoutScrolling(save);
    await expectControlVisibleWithoutScrolling(publish);
    const scrolledActions = await actions.boundingBox();
    if (!scrolledActions) throw new Error('Barra de ações desapareceu após rolar o laudo.');
    expect(Math.abs(scrolledActions.y - initialActions.y)).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(staff.page);
    await publish.focus();
    await staff.page.keyboard.press('Enter');
    const reviewDialog = staff.page.getByRole('alertdialog', { name: 'Publicar laudo?' });
    await expectControlVisibleWithoutScrolling(reviewDialog.getByRole('button', { name: 'Voltar', exact: true }));
    await expectControlVisibleWithoutScrolling(reviewDialog.getByRole('button', { name: 'Publicar laudo', exact: true }));
    await expectNoHorizontalOverflow(staff.page);
    await expectFocusTrap(staff.page, reviewDialog);
    await staff.page.keyboard.press('Escape');
    await staff.api.publish(draft.id);
    await ana.page.goto('/meus-exames');
    await applyLayout(ana.page);
    await expect(ana.page.locator(`a[href="/meus-exames/${appointment.id}/laudo"]`)).toBeVisible();
    await expectNoHorizontalOverflow(ana.page);
    await ana.page.goto(`/meus-exames/${appointment.id}/laudo`);
    await applyLayout(ana.page);
    await expect(ana.page.getByRole('heading', { level: 1, name: report.title, exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(ana.page);
    await expectControlWithinViewport(ana.page.getByRole('link', { name: 'Voltar para meus exames', exact: true }));
  });
}

test('a11y · portal, leitor publicado e 404 opaco passam axe', async ({ staff, ana, scenario }) => {
  test.setTimeout(120_000);
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, report);
  await staff.api.publish(draft.id);
  await ana.page.goto('/meus-exames');
  await expect(ana.page.locator(`a[href="/meus-exames/${appointment.id}/laudo"]`)).toBeVisible();
  await auditAccessibility(ana.page);
  await ana.page.goto(`/meus-exames/${appointment.id}/laudo`);
  await expect(ana.page.getByRole('heading', { level: 1, name: report.title, exact: true })).toBeVisible();
  await auditAccessibility(ana.page);
  await ana.page.goto('/meus-exames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/laudo');
  await expect(ana.page.getByRole('heading', { name: 'Não encontramos este registro', exact: true })).toBeVisible();
  await auditAccessibility(ana.page);
});
