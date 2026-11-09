import { CalendarClock, CalendarPlus, FileText, LogOut, UsersRound, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useSession } from '../../app/session';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/button';
import { AppFooter } from './AppFooter';
import { RouteFocus } from './RouteFocus';

const navigationClassName = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:min-h-12 lg:flex-none lg:justify-start lg:gap-3 lg:py-2.5 ${
    isActive
      ? 'border-brand-200 bg-accent text-accent-foreground font-semibold'
      : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

export function AppShell() {
  const { user, logout } = useSession();
  const isStaff = user?.role === 'STAFF';
  const roleWidth = isStaff ? 'max-w-7xl' : 'max-w-4xl';

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground lg:pl-60">
      <RouteFocus />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-2 sm:px-6 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
        <div className="min-w-0 lg:px-2">
          <NavLink
            to={isStaff ? '/agenda' : '/meus-exames'}
            className="inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
          >
            <Logo variant="full" />
          </NavLink>
        </div>

        <nav
          aria-label="Navegação principal"
          className="order-3 col-span-2 flex min-w-0 flex-wrap gap-1 lg:order-2 lg:mt-10 lg:flex-col lg:gap-2"
        >
          {isStaff ? (
            <>
              <NavLink to="/agenda" end={false} className={navigationClassName}>
                <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                <span>Agenda</span>
              </NavLink>
              <NavLink to="/agendamentos/novo" className={navigationClassName} aria-label="Novo agendamento">
                <CalendarPlus className="size-4 shrink-0" aria-hidden="true" />
                <span className="lg:hidden" aria-hidden="true">Agendar</span>
                <span className="hidden lg:inline" aria-hidden="true">Novo agendamento</span>
              </NavLink>
              <NavLink to="/pacientes" className={navigationClassName}>
                <UsersRound className="size-4 shrink-0" aria-hidden="true" />
                <span>Pacientes</span>
              </NavLink>
            </>
          ) : (
            <NavLink to="/meus-exames" end className={navigationClassName}>
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span>Meus exames</span>
            </NavLink>
          )}
        </nav>

        <div className="order-2 flex min-w-0 items-center justify-end gap-3 lg:order-3 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-4 lg:border-t lg:border-border lg:pt-5">
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground lg:flex">
              <UserIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 max-w-40 text-right text-sm lg:max-w-none lg:text-left">
              <span className="block break-words font-semibold text-foreground">{user?.name}</span>
              <span className="mt-0.5 block text-muted-foreground">{isStaff ? 'Equipe Dr. Laudo' : 'Paciente'}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="gap-2 lg:w-full lg:justify-start"
            aria-label="Sair"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>Sair</span>
          </Button>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div className={`mx-auto w-full ${roleWidth} px-4 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12 xl:px-12`}>
          <Outlet />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
