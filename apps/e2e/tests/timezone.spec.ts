import { test, expect } from '../support/fixtures.ts';
import { displayDate, slotAt } from '../support/dates.ts';
import { QA } from '../support/qa.ts';
import { appointmentItem, reportHref } from '../support/ui.ts';

test('RN-25/TEMPO-07 · navegador e processo em Tóquio mantêm data/hora de Brasília', async ({ staff, ana, scenario }) => {
  expect(process.env.TZ).toBe('Asia/Tokyo');
  expect(await staff.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Asia/Tokyo');
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, { title: 'Resultado QA entre fusos', body: 'Resultado fictício com horário exclusivo de Brasília.', professionalName: 'Dra. Fuso QA' });
  await staff.api.publish(draft.id);
  // 10:00 São Paulo = 13:00 UTC on current/future clinic dates, not 22:00 Tokyo.
  expect(appointment.startsAt).toBe(`${scenario.date}T13:00:00.000Z`);
  await staff.page.goto(`/agenda?${new URLSearchParams({ date: scenario.date, patientId: QA.ana.id })}`);
  const item = appointmentItem(staff.page, appointment.id);
  await expect(item.locator(`time[datetime="${appointment.startsAt}"]`)).toHaveText('10:00');
  await expect(staff.page.getByText('Horário de Brasília', { exact: true })).toBeVisible();
  await staff.page.reload();
  await expect(staff.page.getByLabel('Data', { exact: true })).toHaveValue(scenario.date);
  await expect(staff.page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.ana.id);
  await staff.page.goto(reportHref(appointment.id, scenario.date, QA.ana.id));
  await expect(staff.page.getByText(`${displayDate(scenario.date)} às 10:00`, { exact: true })).toBeVisible();
  await staff.page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await expect(staff.page).toHaveURL((url) => url.searchParams.get('date') === scenario.date && url.searchParams.get('patientId') === QA.ana.id);
  await ana.page.goto(`/meus-exames/${appointment.id}/laudo`);
  await expect(ana.page.getByText(`${displayDate(scenario.date)} às 10:00`, { exact: true })).toBeVisible();
  await expect(ana.page.getByText('Horário de Brasília', { exact: true })).toBeVisible();
  await expect(ana.page.getByText('Publicado em', { exact: true })).toBeVisible();
});
