import {
  HealthResponseSchema, MyAppointmentListResponseSchema,
  PatientListResponseSchema, StaffAppointmentListResponseSchema,
} from '@drlaudo/contract';
import { test, expect } from '@playwright/test';
import { apiResponse, signIn } from '../support/ui.ts';
import { clinicDate } from '../support/dates.ts';

test('smoke · proxy alcança API e PostgreSQL reais', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  HealthResponseSchema.parse(body);
});

for (const account of [
  {
    role: 'STAFF',
    email: process.env.SMOKE_STAFF_EMAIL ?? 'equipe@drlaudo.test',
    password: process.env.SMOKE_STAFF_PASSWORD ?? 'Demo@1234',
  },
  {
    role: 'PATIENT',
    email: process.env.SMOKE_PATIENT_EMAIL ?? 'ana.souza@drlaudo.test',
    password: process.env.SMOKE_PATIENT_PASSWORD ?? 'Demo@1234',
  },
] as const) {
  test(`smoke · login real ${account.role} e leitura concluída da home autorizada`, async ({ page }) => {
    await page.goto('/login');
    const list = apiResponse(page, 'GET', account.role === 'STAFF' ? '/appointments' : '/me/appointments');
    const patients = account.role === 'STAFF' ? apiResponse(page, 'GET', '/patients') : null;
    const session = await signIn(page, account.email, account.password);
    expect(session.user.role).toBe(account.role);
    expect(session.user.email).toBe(account.email.trim().toLowerCase());
    await expect(page).toHaveURL(account.role === 'STAFF' ? /\/agenda(?:\?|$)/ : /\/meus-exames$/);
    const response = await list;
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    if (patients) {
      const catalog = await patients;
      expect(catalog.status()).toBe(200);
      const catalogBody: unknown = await catalog.json();
      PatientListResponseSchema.parse(catalogBody);
    }
    if (account.role === 'STAFF') {
      const appointments = StaffAppointmentListResponseSchema.parse(body);
      await expect(page.getByRole('grid')).toBeVisible();
      const selectedDate = new URL(page.url()).searchParams.get('calendarDate');
      const visibleAppointments = appointments.filter((appointment) => clinicDate(new Date(appointment.startsAt)) === selectedDate);
      await expect.poll(() => page.locator('[data-appointment-id]:visible')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-appointment-id'))))
        .toEqual(visibleAppointments.map((appointment) => appointment.id));
    } else {
      const appointments = MyAppointmentListResponseSchema.parse(body);
      await expect(page.getByRole('article')).toHaveCount(appointments.length);
      if (appointments.length === 0) {
        await expect(page.getByText('Você ainda não tem exames agendados.', { exact: true })).toBeVisible();
      }
    }
    await expect(page.getByRole('heading', { level: 1, name: account.role === 'STAFF' ? 'Agenda de exames' : 'Meus exames' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /[Cc]arregando|[Vv]erificando/ })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });
}
