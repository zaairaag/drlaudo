import { ErrorResponseSchema, StaffAppointmentSchema } from '@drlaudo/contract';
import { test, expect } from '../support/fixtures.ts';
import { expectApiError } from '../support/api.ts';
import { addDays, clinicDate, displayDate, slotAt } from '../support/dates.ts';
import { QA } from '../support/qa.ts';
import { apiResponse, appointmentItem, reportHref } from '../support/ui.ts';

test('RF-03 · criação usa slot real, preserva paciente/exame ao trocar data e destaca item confirmado', async ({ staff, scenario }) => {
  const page = staff.page;
  await page.goto(`/agendamentos/novo?date=${scenario.date}`);
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Exame', { exact: true })).toHaveValue('');
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.ana.id);
  await page.getByLabel('Exame', { exact: true }).selectOption(QA.xray.id);
  await page.getByRole('button', { name: '10:00, disponível', exact: true }).click();
  await page.getByLabel('Data', { exact: true }).fill(addDays(scenario.date, 1));
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.ana.id);
  await expect(page.getByLabel('Exame', { exact: true })).toHaveValue(QA.xray.id);
  await expect(page.getByRole('button', { name: '10:00, disponível', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Data', { exact: true }).fill(scenario.date);
  await page.getByRole('button', { name: '10:00, disponível', exact: true }).click();
  const created = apiResponse(page, 'POST', '/appointments');
  await page.getByRole('button', { name: 'Agendar exame', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  const appointment = StaffAppointmentSchema.parse(body);
  expect(appointment).toMatchObject({ patient: { id: QA.ana.id }, examType: { id: QA.xray.id }, startsAt: slotAt(scenario.date, 6), status: 'SCHEDULED', report: null });
  await expect(page).toHaveURL((url) => url.pathname === '/agenda'
    && url.searchParams.get('date') === scenario.date
    && url.searchParams.get('focus') === appointment.id
    && !url.searchParams.has('patientId'));
  const item = appointmentItem(page, appointment.id);
  await expect(item).toBeVisible();
  await expect(item).toBeFocused();
  await expect(item.getByText('Recém-agendado', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir agendamento', exact: true })).toBeVisible();
  expect((await staff.api.appointment(appointment.id)).startsAt).toBe(slotAt(scenario.date, 6));
});

test('RF-04 · filtros de data/paciente têm AND, ordem e persistência em URL/F5/histórico', async ({ staff, scenario }) => {
  const anaFirst = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 0));
  const bruno = await staff.api.createAppointment(QA.bruno.id, QA.mri.id, slotAt(scenario.date, 1));
  const anaLast = await staff.api.createAppointment(QA.ana.id, QA.ultrasound.id, slotAt(scenario.date, 2));
  await staff.api.cancel(anaLast.id);
  const page = staff.page;
  const visibleIds = () => page.locator('[data-appointment-id]:visible').evaluateAll((items) => items.map((item) => item.getAttribute('data-appointment-id')));
  await page.goto(`/agenda?${new URLSearchParams({ date: scenario.date, patientId: QA.ana.id })}`);
  await expect.poll(visibleIds).toEqual([anaFirst.id, anaLast.id]);
  await expect(appointmentItem(page, anaLast.id).getByText('Cancelado', { exact: true })).toBeVisible();
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.bruno.id);
  await expect.poll(visibleIds).toEqual([bruno.id]);
  await page.reload();
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(scenario.date);
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.bruno.id);
  await expect.poll(visibleIds).toEqual([bruno.id]);
  await page.getByRole('button', { name: 'Próximo dia', exact: true }).click();
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(addDays(scenario.date, 1));
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.bruno.id);
  await expect(page.getByText('Nenhum agendamento para os filtros selecionados.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect.poll(visibleIds).toEqual([bruno.id]);
  await page.getByLabel('Paciente', { exact: true }).selectOption('');
  await expect.poll(visibleIds).toEqual([anaFirst.id, bruno.id, anaLast.id]);
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.ana.id);
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(clinicDate());
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.ana.id);
  expect(new URL(page.url()).searchParams.get('patientId')).toBe(QA.ana.id);
});

test('fluxo equipe · navegação global para novo exame preserva a área de trabalho', async ({ staff, scenario }) => {
  const page = staff.page;
  await page.setViewportSize({ width: 375, height: 812 });
  const origin = `/agenda?${new URLSearchParams({ scope: 'all', patientId: QA.ana.id, view: 'calendar', calendarDate: scenario.date })}`;
  await page.goto(origin);
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Novo agendamento', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/agendamentos/novo' && url.searchParams.get('returnTo') === origin);
  await expect.poll(async () => {
    const back = await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
    return back !== null && nav !== null && back.y >= nav.y + nav.height;
  }).toBe(true);
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(scenario.date);
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Exame', { exact: true })).toHaveValue('');
  await page.getByLabel('Data', { exact: true }).fill(addDays(scenario.date, 1));
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === origin);
  await expect(page.getByRole('grid')).toBeVisible();
});

test('RF-04 · todos os agendamentos preserva paciente, datas e retorno do laudo', async ({ staff, scenario }) => {
  const near = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 3));
  const distantDate = addDays(scenario.date, 90);
  const distant = await staff.api.createAppointment(QA.ana.id, QA.mri.id, slotAt(distantDate, 3));
  const other = await staff.api.createAppointment(QA.bruno.id, QA.ultrasound.id, slotAt(distantDate, 4));
  await staff.api.cancel(distant.id);
  const page = staff.page;
  await page.goto(`/agenda?${new URLSearchParams({ date: scenario.date, patientId: QA.ana.id })}`);
  await expect(appointmentItem(page, near.id)).toBeVisible();
  await expect(appointmentItem(page, distant.id)).toHaveCount(0);
  await page.getByRole('button', { name: 'Linha do tempo', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('scope') === 'all'
    && url.searchParams.get('patientId') === QA.ana.id && !url.searchParams.has('date'));
  await expect(appointmentItem(page, distant.id)).toBeVisible();
  await expect(appointmentItem(page, distant.id).getByText('Cancelado', { exact: true })).toBeVisible();
  await expect(appointmentItem(page, distant.id)).toContainText(displayDate(distantDate));
  await expect(appointmentItem(page, near.id).getByText('Próximo exame', { exact: true })).toBeVisible();
  const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });
  await expect(page.getByRole('heading', { name: new RegExp(monthFormatter.format(new Date(`${scenario.date}T12:00:00.000Z`)), 'i') })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(monthFormatter.format(new Date(`${distantDate}T12:00:00.000Z`)), 'i') })).toBeVisible();
  await expect(appointmentItem(page, other.id)).toHaveCount(0);
  await page.goto(`/agenda?${new URLSearchParams({ date: scenario.date, patientId: QA.ana.id })}`);
  await page.getByRole('button', { name: 'Calendário', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(appointmentItem(page, near.id)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('link', { name: 'Ver exames do dia (1)', exact: true }).click();
  await expect(page.locator('#calendar-day-heading')).toBeFocused();
  await expect.poll(async () => {
    const heading = await page.locator('#calendar-day-heading').boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
    return heading !== null && nav !== null && heading.y >= nav.y + nav.height;
  }).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(appointmentItem(page, distant.id)).toHaveCount(0);
  await page.getByRole('gridcell', { selected: true }).getByRole('button').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => url.searchParams.get('calendarDate') === addDays(scenario.date, 1));
  await expect(page.getByRole('gridcell', { selected: true }).getByRole('button')).toBeFocused();
  await page.getByLabel('Data', { exact: true }).fill(scenario.date);
  await expect(appointmentItem(page, near.id)).toBeVisible();
  await appointmentItem(page, near.id).getByRole('link', { name: 'Criar laudo', exact: true }).click();
  await page.reload();
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'calendar'
    && url.searchParams.get('calendarDate') === scenario.date && url.searchParams.get('patientId') === QA.ana.id);
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(appointmentItem(page, near.id)).toBeVisible();
  await page.getByRole('button', { name: 'Linha do tempo', exact: true }).click();
  await page.reload();
  await expect(appointmentItem(page, near.id)).toBeVisible();
  await expect(appointmentItem(page, distant.id)).toBeVisible();
  await appointmentItem(page, near.id).getByRole('link', { name: 'Criar laudo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Criar laudo', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Voltar para agenda', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/agenda'
    && url.searchParams.get('scope') === 'all' && url.searchParams.get('patientId') === QA.ana.id
    && !url.searchParams.has('date'));
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.bruno.id);
  await expect(appointmentItem(page, other.id)).toBeVisible();
  await expect(appointmentItem(page, near.id)).toHaveCount(0);
  await expect(appointmentItem(page, distant.id)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('scope')).toBe('all');
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(clinicDate());
  expect(new URL(page.url()).searchParams.has('scope')).toBe(false);
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.bruno.id);
});

test('RF-05 · desistir não cancela; confirmar preserva DRAFT e permite novo id no slot liberado', async ({ staff, scenario }) => {
  const appointment = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 6));
  const draft = await staff.api.createReport(appointment.id, { title: 'Rascunho preservado QA', body: 'Texto QA preservado após cancelamento.', professionalName: 'Dra. QA' });
  const page = staff.page;
  await page.goto(`/agenda?date=${scenario.date}`);
  const trigger = appointmentItem(page, appointment.id).getByRole('button', { name: `Cancelar agendamento de ${QA.ana.name}`, exact: true });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/cancel')) mutations.push(request.url());
  });
  await trigger.click();
  let dialog = page.getByRole('alertdialog', { name: 'Cancelar este agendamento?' });
  await expect(dialog.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(mutations).toEqual([]);
  expect((await staff.api.appointment(appointment.id)).status).toBe('SCHEDULED');
  await trigger.click();
  dialog = page.getByRole('alertdialog', { name: 'Cancelar este agendamento?' });
  await expect(dialog.getByText('O rascunho será preservado e ficará bloqueado.', { exact: true })).toBeVisible();
  const canceled = apiResponse(page, 'POST', `/appointments/${appointment.id}/cancel`);
  await dialog.getByRole('button', { name: 'Cancelar agendamento', exact: true }).click();
  expect((await canceled).status()).toBe(200);
  await expect(appointmentItem(page, appointment.id).getByText('Cancelado', { exact: true })).toBeVisible();
  expect(mutations).toHaveLength(1);
  expect(await staff.api.report(appointment.id)).toEqual(draft);
  await page.goto(reportHref(appointment.id, scenario.date));
  await expect(page.getByRole('alert').filter({ hasText: 'O agendamento foi cancelado; o laudo está bloqueado.' })).toBeVisible();
  await expect(page.getByLabel('Texto do laudo', { exact: true })).toHaveCount(0);
  await page.goto(`/agendamentos/novo?date=${scenario.date}`);
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.bruno.id);
  await page.getByLabel('Exame', { exact: true }).selectOption(QA.mri.id);
  await page.getByRole('button', { name: '10:00, disponível', exact: true }).click();
  const creation = apiResponse(page, 'POST', '/appointments');
  await page.getByRole('button', { name: 'Agendar exame', exact: true }).click();
  const createdResponse = await creation;
  expect(createdResponse.status()).toBe(201);
  const value: unknown = await createdResponse.json();
  const replacement = StaffAppointmentSchema.parse(value);
  expect(replacement.id).not.toBe(appointment.id);
  expect(replacement.report).toBeNull();
  expect(replacement.startsAt).toBe(appointment.startsAt);
  expect((await staff.api.appointment(appointment.id)).status).toBe('CANCELED');
  expect((await staff.api.report(appointment.id)).id).toBe(draft.id);
});

test('cenário 1: dois POST reais simultâneos reservam um único horário', async ({ staff, scenario }) => {
  const startsAt = slotAt(scenario.date, 6);
  const results = await Promise.all([
    staff.api.request.post('/appointments', { data: { patientId: QA.ana.id, examTypeId: QA.xray.id, startsAt } }),
    staff.api.request.post('/appointments', { data: { patientId: QA.bruno.id, examTypeId: QA.mri.id, startsAt } }),
  ]);
  expect(results.map((result) => result.status()).sort()).toEqual([201, 409]);
  const winner = results.find((result) => result.status() === 201);
  const loser = results.find((result) => result.status() === 409);
  if (!winner || !loser) throw new Error('A corrida QA deve ter um vencedor e um conflito.');
  const errorBody: unknown = await loser.json();
  expect(ErrorResponseSchema.parse(errorBody).error.code).toBe('SLOT_TAKEN');
  const winnerBody: unknown = await winner.json();
  const created = StaffAppointmentSchema.parse(winnerBody);
  const persisted = await staff.api.appointments(scenario.date);
  expect(persisted.map((item) => ({ id: item.id, startsAt: item.startsAt, status: item.status }))).toEqual([
    { id: created.id, startsAt, status: 'SCHEDULED' },
  ]);
});

test('RF-03 · conflito real mantém campos, desmarca slot e reconcilia disponibilidade', async ({ staff, scenario }) => {
  const page = staff.page;
  await page.goto(`/agendamentos/novo?date=${scenario.date}`);
  await page.getByLabel('Paciente', { exact: true }).selectOption(QA.ana.id);
  await page.getByLabel('Exame', { exact: true }).selectOption(QA.xray.id);
  await page.getByRole('button', { name: '10:00, disponível', exact: true }).click();
  const competitor = await staff.api.createAppointment(QA.bruno.id, QA.mri.id, slotAt(scenario.date, 6));
  const conflict = apiResponse(page, 'POST', '/appointments');
  await page.getByRole('button', { name: 'Agendar exame', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole('alert').filter({ hasText: 'Este horário acabou de ser ocupado.' })).toBeVisible();
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue(QA.ana.id);
  await expect(page.getByLabel('Exame', { exact: true })).toHaveValue(QA.xray.id);
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(scenario.date);
  await expect(page.getByRole('button', { name: '10:00, ocupado', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '10:00, ocupado', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await staff.api.appointments(scenario.date)).map((item) => item.id)).toEqual([competitor.id]);
  await page.getByRole('button', { name: '10:30, disponível', exact: true }).click();
  const creation = apiResponse(page, 'POST', '/appointments');
  await page.getByRole('button', { name: 'Agendar exame', exact: true }).click();
  expect((await creation).status()).toBe(201);
  await expect(page).toHaveURL(/\/agenda\?/);
  expect((await staff.api.appointments(scenario.date)).filter((item) => item.status === 'SCHEDULED')).toHaveLength(2);
});

test('cenário 5: horários de ontem são bloqueados no browser e rejeitados pela API', async ({ staff, scenario }) => {
  const yesterday = addDays(clinicDate(), -1);
  await staff.page.goto(`/agendamentos/novo?date=${yesterday}`);
  const past = staff.page.getByRole('button', { name: /, horário passado$/ });
  await expect(past).toHaveCount(24);
  for (const control of await past.all()) await expect(control).toBeDisabled();
  for (const index of [0, 23]) {
    await expectApiError(await staff.api.request.post('/appointments', {
      data: { patientId: QA.ana.id, examTypeId: QA.xray.id, startsAt: slotAt(yesterday, index) },
    }), 422, 'PAST_DATE');
  }
  expect(await staff.api.appointments(yesterday)).toEqual([]);
  const control = await staff.api.createAppointment(QA.ana.id, QA.xray.id, slotAt(scenario.date, 0));
  expect(control.status).toBe('SCHEDULED');
});

test('RF-04 · filtro inválido não dispara consulta inválida e permite recuperação', async ({ staff }) => {
  const requests: string[] = [];
  staff.page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/appointments') requests.push(new URL(request.url()).search);
  });
  await staff.page.goto('/agenda?date=2026-02-30');
  await expect(staff.page.getByRole('button', { name: 'Limpar filtros', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await staff.page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(staff.page.getByLabel('Data', { exact: true })).toHaveValue(clinicDate());
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toBe(`?date=${clinicDate()}`);
});
