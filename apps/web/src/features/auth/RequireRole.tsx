import type { Role } from '@drlaudo/contract';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { homeForRole } from '../../app/navigation';
import { useSession } from '../../app/session';
import { AppFooter } from '../../components/layout/AppFooter';
import { Button } from '../../components/ui/button';

export function SessionGate() {
  const { status, retry, logout } = useSession();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="conteudo" className="flex flex-1 items-center justify-center px-6 py-16">
        {status === 'error' ? (
          <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm" aria-labelledby="session-error-title">
            <ShieldAlert className="mx-auto mb-5 size-10 text-primary" aria-hidden="true" />
            <h1 id="session-error-title" className="font-display text-2xl font-semibold">Não foi possível verificar sua sessão.</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Sua conexão pode ter sido interrompida. Tente novamente ou saia para entrar com outra conta.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={retry}>Tentar novamente</Button>
              <Button variant="outline" onClick={logout}>Sair</Button>
            </div>
          </section>
        ) : (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-muted-foreground">
            <LoaderCircle className="size-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
            <p>Verificando sua sessão…</p>
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
export function RequireRole({ role }: { role: Role }) {
  const { user, status, notice } = useSession();
  const location = useLocation();
  if (status === 'restoring' || status === 'error') return <SessionGate />;
  if (!user) return <Navigate to="/login" replace state={notice ? null : { returnTo: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={homeForRole(user.role)} replace state={{ permissionDenied: true }} />;
  return <Outlet />;
}
