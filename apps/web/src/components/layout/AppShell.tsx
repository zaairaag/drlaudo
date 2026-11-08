import { CalendarClock, CalendarPlus, FileText, LogOut, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useSession } from '../../app/session';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/button';
import { AppFooter } from './AppFooter';
import { RouteFocus } from './RouteFocus';

export function AppShell() {
  const { user, logout } = useSession();
  const isStaff = user?.role === 'STAFF';
  const roleWidth = isStaff ? 'max-w-6xl' : 'max-w-2xl';

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <RouteFocus />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>

      {/* Header institucional */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to={isStaff ? '/agenda' : '/meus-exames'} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Logo variant="full" />
            </NavLink>

            {/* Navegação desktop */}
            <nav aria-label="Navegação principal" className="hidden md:flex md:items-center md:gap-1">
              {isStaff ? (
                <>
                  <NavLink
                    to="/agenda"
                    end={false}
                    className={({ isActive }) =>
                      `inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      }`
                    }
                  >
                    <CalendarClock className="size-4" aria-hidden="true" />
                    <span>Agenda</span>
                  </NavLink>
                  <NavLink
                    to="/agendamentos/novo"
                    className={({ isActive }) =>
                      `inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      }`
                    }
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    <span>Novo agendamento</span>
                  </NavLink>
                </>
              ) : (
                <NavLink
                  to="/meus-exames"
                  end
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`
                  }
                >
                  <FileText className="size-4" aria-hidden="true" />
                  <span>Meus exames</span>
                </NavLink>
              )}
            </nav>
          </div>

          {/* Dados do usuário e Sair */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs sm:block">
              <span className="block font-semibold text-foreground">{user?.name}</span>
              <span className="block text-muted-foreground">{isStaff ? 'Equipe Dr. Laudo' : 'Paciente'}</span>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground sm:hidden">
              <UserIcon className="size-4" aria-hidden="true" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="gap-1.5"
              aria-label="Sair"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>

        {/* Navegação mobile */}
        <nav aria-label="Navegação móvel" className="flex border-t border-border px-3 py-1.5 md:hidden">
          {isStaff ? (
            <>
              <NavLink
                to="/agenda"
                className={({ isActive }) =>
                  `flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                    isActive ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                <span>Agenda</span>
              </NavLink>
              <NavLink
                to="/agendamentos/novo"
                className={({ isActive }) =>
                  `flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                    isActive ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                <span>Novo agendamento</span>
              </NavLink>
            </>
          ) : (
            <NavLink
              to="/meus-exames"
              className={({ isActive }) =>
                `flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                  isActive ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              <FileText className="size-4" aria-hidden="true" />
              <span>Meus exames</span>
            </NavLink>
          )}
        </nav>
      </header>

      {/* Conteúdo principal */}
      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        <div className={`mx-auto w-full ${roleWidth} px-4 py-6 sm:px-6 sm:py-8`}>
          <Outlet />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
