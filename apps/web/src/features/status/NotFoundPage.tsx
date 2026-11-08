import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { homeForRole } from '../../app/navigation';
import { useSession } from '../../app/session';
import { AppFooter } from '../../components/layout/AppFooter';
import { buttonVariants } from '../../components/ui/button';

export function NotFoundPage() {
  const { user } = useSession();
  const homePath = user ? homeForRole(user.role) : '/login';

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="conteudo" className="flex flex-1 items-center justify-center p-6">
        <section aria-labelledby="not-found-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <FileQuestion className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden="true" />
          <h1 id="not-found-title" className="font-display text-2xl font-bold tracking-tight text-foreground">
            Página não encontrada
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O endereço informado não existe ou não está mais disponível.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={homePath} className={buttonVariants({ variant: 'default' })}>
              Voltar ao início
            </Link>
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
