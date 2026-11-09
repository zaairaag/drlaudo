import { randomUUID } from 'node:crypto';
import { PatientListResponseSchema, PatientSchema } from '@drlaudo/contract';
import { request as requestFactory } from '@playwright/test';
import { test, expect } from '../support/fixtures.ts';
import { expectApiError, responseData } from '../support/api.ts';
import { slotAt } from '../support/dates.ts';
import { API_URL, QA, WEB_URL } from '../support/qa.ts';
import { apiResponse, signIn } from '../support/ui.ts';

test('STAFF · cadastrar/editar paciente permite login real e preserva ownership sem acesso à equipe', async ({ browser, staff, scenario }) => {
  const suffix = randomUUID();
  const email = `cadastro-${suffix}@qa.test`;
  const editedEmail = `editado-${suffix}@qa.test`;
  const password = 'PacienteQA@12345';
  const page = staff.page;
  await page.goto('/pacientes');
  await page.getByRole('button', { name: 'Novo paciente', exact: true }).click();
  const creationDialog = page.getByRole('dialog', { name: 'Novo paciente', exact: true });
  await creationDialog.getByLabel('Nome', { exact: true }).fill('  Paciente cadastrado QA  ');
  await creationDialog.getByLabel('E-mail', { exact: true }).fill(email);
  await creationDialog.getByLabel('Senha', { exact: true }).fill(password);
  const creation = apiResponse(page, 'POST', '/patients');
  await creationDialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const result = await creation;
  expect(result.status()).toBe(201);
  const body: unknown = await result.json();
  const patient = PatientSchema.parse(body);
  expect(patient).toMatchObject({ name: 'Paciente cadastrado QA', email });
  await expect(creationDialog).toHaveCount(0);
  const row = page.locator(`[data-patient-id="${patient.id}"]:visible`);
  await expect(row.getByText(email, { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Editar paciente', exact: true }).click();
  const editionDialog = page.getByRole('dialog', { name: 'Editar paciente', exact: true });
  await expect(editionDialog.getByLabel('Senha', { exact: true })).toHaveCount(0);
  await editionDialog.getByLabel('Nome', { exact: true }).fill('Paciente editado QA');
  await editionDialog.getByLabel('E-mail', { exact: true }).fill(editedEmail);
  const edition = apiResponse(page, 'PATCH', `/patients/${patient.id}`);
  await editionDialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  const edited = await edition;
  expect(edited.status()).toBe(200);
  const updatedBody: unknown = await edited.json();
  expect(PatientSchema.parse(updatedBody)).toEqual({ id: patient.id, name: 'Paciente editado QA', email: editedEmail, active: true });
  await expect(editionDialog).toHaveCount(0);
  await expect(row.getByText(editedEmail, { exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByText('Paciente editado QA', { exact: true })).toBeVisible();
  await expect(row.getByText(email, { exact: true })).toHaveCount(0);

  const ownAppointment = await staff.api.createAppointment(patient.id, QA.xray.id, slotAt(scenario.date, 6));
  const ownDraft = await staff.api.createReport(ownAppointment.id, { title: 'Laudo do paciente cadastrado QA', body: 'Resultado fictício exclusivo do novo paciente QA.', professionalName: 'Dra. QA' });
  await staff.api.publish(ownDraft.id);
  const foreignAppointment = await staff.api.createAppointment(QA.ana.id, QA.mri.id, slotAt(scenario.date, 7));
  const foreignDraft = await staff.api.createReport(foreignAppointment.id, { title: 'Laudo alheio QA', body: 'Texto de outra paciente não pode ser revelado.', professionalName: 'Dra. QA' });
  await staff.api.publish(foreignDraft.id);

  const context = await browser.newContext({ baseURL: WEB_URL, storageState: { cookies: [], origins: [] } });
  try {
    const patientPage = await context.newPage();
    await patientPage.goto('/login');
    const session = await signIn(patientPage, editedEmail, password);
    expect(session.user).toMatchObject({ id: patient.id, name: 'Paciente editado QA', email: editedEmail, role: 'PATIENT' });
    await expect(patientPage).toHaveURL(/\/meus-exames$/);
    const api = await requestFactory.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.token}` } });
    try {
      await expectApiError(await api.get('/patients'), 403, 'FORBIDDEN');
      await expectApiError(await api.get('/appointments'), 403, 'FORBIDDEN');
      await expectApiError(await api.post('/patients', {
        data: { name: 'Criação não autorizada QA', email: `proibido-${suffix}@qa.test`, password },
      }), 403, 'FORBIDDEN');
      await expectApiError(await api.patch(`/patients/${patient.id}`, {
        data: { name: 'Alteração não autorizada QA' },
      }), 403, 'FORBIDDEN');
      await expectApiError(await api.get(`/me/appointments/${foreignAppointment.id}/report`), 404, 'NOT_FOUND');
      const mine = await api.get('/me/appointments');
      const mineBody: unknown = await mine.json();
      expect(mine.status()).toBe(200);
      expect(mineBody).toEqual([{ id: ownAppointment.id, startsAt: ownAppointment.startsAt, status: 'SCHEDULED', examType: { id: QA.xray.id, name: QA.xray.name }, hasPublishedReport: true }]);
      await patientPage.locator(`a[href="/meus-exames/${ownAppointment.id}/laudo"]`).click();
      await expect(patientPage.getByRole('heading', { level: 1, name: ownDraft.title, exact: true })).toBeVisible();
      await expect(patientPage.getByText(foreignDraft.body, { exact: true })).toHaveCount(0);
      await patientPage.goto('/pacientes');
      await expect(patientPage).toHaveURL(/\/meus-exames$/);
      await expect(patientPage.getByRole('button', { name: 'Novo paciente', exact: true })).toHaveCount(0);
    } finally {
      await api.dispose();
    }
  } finally {
    await context.close();
  }
});

test('STAFF · desativar preserva histórico e reativar restaura o acesso do paciente', async ({ browser, staff, scenario }) => {
  const email = `atividade-${randomUUID()}@qa.test`;
  const password = 'PacienteQA@12345';
  const patient = await responseData(await staff.api.request.post('/patients', {
    data: { name: 'Paciente atividade QA', email, password },
  }), 201, PatientSchema);
  const appointment = await staff.api.createAppointment(patient.id, QA.xray.id, slotAt(scenario.date, 9));
  const draft = await staff.api.createReport(appointment.id, {
    title: 'Histórico preservado QA', body: 'Texto fictício mantido após desativar paciente.', professionalName: 'Dra. QA',
  });
  const context = await browser.newContext({ baseURL: WEB_URL, storageState: { cookies: [], origins: [] } });
  try {
    const portal = await context.newPage();
    await portal.goto('/login');
    await signIn(portal, email, password);
    await expect(portal.getByRole('heading', { name: 'Meus exames', exact: true })).toBeVisible();
    const page = staff.page;
    await page.goto('/pacientes');
    const row = page.locator(`[data-patient-id="${patient.id}"]:visible`);
    await row.getByRole('button', { name: 'Desativar paciente', exact: true }).click();
    let dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Desativar paciente', exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Desativar paciente', exact: true }).click();
    dialog = page.getByRole('alertdialog');
    const deactivated = apiResponse(page, 'PATCH', `/patients/${patient.id}`);
    await dialog.getByRole('button', { name: 'Desativar paciente', exact: true }).click();
    expect((await deactivated).status()).toBe(200);
    await expect(row.getByText('Inativo', { exact: true })).toBeVisible();
    await portal.reload();
    await expect(portal).toHaveURL(/\/login(?:\?|$)/);
    expect(await staff.api.report(appointment.id)).toEqual(draft);
    expect((await staff.api.appointment(appointment.id)).status).toBe('SCHEDULED');
    await page.goto(`/agendamentos/novo?date=${scenario.date}`);
    await expect(page.getByLabel('Paciente', { exact: true }).locator(`option[value="${patient.id}"]`)).toHaveCount(0);
    await page.goto('/pacientes');
    await row.getByRole('button', { name: 'Reativar paciente', exact: true }).click();
    const reactivated = apiResponse(page, 'PATCH', `/patients/${patient.id}`);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reativar paciente', exact: true }).click();
    expect((await reactivated).status()).toBe(200);
    await expect(row.getByText('Ativo', { exact: true })).toBeVisible();
    await portal.goto('/login');
    await signIn(portal, email, password);
    await expect(portal.getByRole('article')).toHaveCount(1);
    expect(await staff.api.report(appointment.id)).toEqual(draft);
  } finally {
    await context.close();
  }
});

test('STAFF · e-mail duplicado não fecha formulário nem cria paciente extra', async ({ staff }) => {
  const before = await responseData(await staff.api.request.get('/patients'), 200, PatientListResponseSchema);
  const page = staff.page;
  await page.goto('/pacientes');
  await page.getByRole('button', { name: 'Novo paciente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo paciente', exact: true });
  await dialog.getByLabel('Nome', { exact: true }).fill('Cadastro duplicado QA');
  await dialog.getByLabel('E-mail', { exact: true }).fill(QA.ana.email);
  await dialog.getByLabel('Senha', { exact: true }).fill('PacienteQA@12345');
  const creation = apiResponse(page, 'POST', '/patients');
  await dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const response = await creation;
  expect(response.status()).toBe(409);
  await expect(dialog.getByText('Este e-mail já está cadastrado.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Cadastro duplicado QA');
  await expect(dialog.getByLabel('E-mail', { exact: true })).toHaveValue(QA.ana.email);
  const after = await responseData(await staff.api.request.get('/patients'), 200, PatientListResponseSchema);
  expect(after).toEqual(before);
});
