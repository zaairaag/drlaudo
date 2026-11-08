import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { SessionProvider, useSession } from './app/session';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RequireRole, SessionGate } from './features/auth/RequireRole';
import { NotFoundPage } from './features/status/NotFoundPage';

// Componentes carregados sob demanda
const AgendaPage = lazy(() => import('./features/agenda/AgendaPage').then((module) => ({ default: module.AgendaPage })));
const NewAppointmentPage = lazy(() => import('./features/appointments/NewAppointmentPage').then((module) => ({ default: module.NewAppointmentPage })));
const ReportPage = lazy(() => import('./features/reports/ReportPage').then((module) => ({ default: module.ReportPage })));
const MyAppointmentsPage = lazy(() => import('./features/patient/MyAppointmentsPage').then((module) => ({ default: module.MyAppointmentsPage })));
const PatientReportPage = lazy(() => import('./features/patient/PatientReportPage').then((module) => ({ default: module.PatientReportPage })));
const DesignSystemPage = lazy(() => import('./features/status/DesignSystemPage').then((module) => ({ default: module.DesignSystemPage })));

function IndexRedirect() {
  const { user, status } = useSession();
  if (status === 'restoring') return <SessionGate />;
  if (user?.role === 'STAFF') return <Navigate to="/agenda" replace />;
  if (user?.role === 'PATIENT') return <Navigate to="/meus-exames" replace />;
  return <Navigate to="/login" replace />;
}

function SuspenseFallback({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SessionGate />}>{children}</Suspense>;
}

export function createRoutes(): RouteObject[] {
  const isDev = Boolean(import.meta.env?.DEV);

  return [
    {
      element: (
        <SessionProvider>
          <Outlet />
        </SessionProvider>
      ),
      children: [
        {
          index: true,
          element: <IndexRedirect />,
        },
        {
          path: '/login',
          element: <LoginPage />,
        },
        {
          element: <RequireRole role="STAFF" />,
          children: [
            {
              element: <AppShell />,
              children: [
                {
                  path: '/agenda',
                  element: (
                    <SuspenseFallback>
                      <AgendaPage />
                    </SuspenseFallback>
                  ),
                },
                {
                  path: '/agendamentos/novo',
                  element: (
                    <SuspenseFallback>
                      <NewAppointmentPage />
                    </SuspenseFallback>
                  ),
                },
                {
                  path: '/agendamentos/:id/laudo',
                  element: (
                    <SuspenseFallback>
                      <ReportPage />
                    </SuspenseFallback>
                  ),
                },
              ],
            },
          ],
        },
        {
          element: <RequireRole role="PATIENT" />,
          children: [
            {
              element: <AppShell />,
              children: [
                {
                  path: '/meus-exames',
                  element: (
                    <SuspenseFallback>
                      <MyAppointmentsPage />
                    </SuspenseFallback>
                  ),
                },
                {
                  path: '/meus-exames/:id/laudo',
                  element: (
                    <SuspenseFallback>
                      <PatientReportPage />
                    </SuspenseFallback>
                  ),
                },
              ],
            },
          ],
        },
        ...(isDev
          ? [
              {
                path: '/_ds',
                element: (
                  <SuspenseFallback>
                    <DesignSystemPage />
                  </SuspenseFallback>
                ),
              },
            ]
          : []),
        {
          path: '*',
          element: <NotFoundPage />,
        },
      ],
    },
  ];
}

export const router = createBrowserRouter(createRoutes());

export function createAppRouter(options?: { initialEntries?: string[] }) {
  return createMemoryRouter(createRoutes(), options);
}
