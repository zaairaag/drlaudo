import { Link } from 'react-router';
import { Calendar, FileCheck2, ArrowRight } from 'lucide-react';
import { useGetMyAppointmentsQuery } from '../../app/api';
import { PageHeader } from '../../components/product/PageHeader';
import { StatusBadge } from '../../components/product/StatusBadge';
import { EmptyState } from '../../components/product/EmptyState';
import { Button } from '../../components/ui/button';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { formatDateTime } from '../../lib/time';

export function MyAppointmentsPage() {
  const query = useGetMyAppointmentsQuery();
  const appointments = query.currentData ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus exames"
        description="Acompanhe seus agendamentos e consulte seus laudos publicados."
      />
      <TimezoneNote />

      {query.isFetching ? (
        <div className="space-y-4 p-6" role="status" aria-live="polite">
          <span className="text-sm text-muted-foreground">Carregando seus exames…</span>
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-6" role="alert">
          <p className="text-sm text-destructive">Não foi possível carregar seus exames.</p>
          <Button variant="outline" className="mt-3" onClick={() => { void query.refetch(); }}>
            Tentar novamente
          </Button>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState
          title="Você ainda não tem exames agendados."
          description="Quando a clínica agendar um exame para você, ele aparecerá aqui com a data e o horário."
          icon={Calendar}
        />
      ) : (
        <div className="space-y-4" role="feed" aria-label="Histórico de exames">
          {appointments.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-border/80"
              tabIndex={-1}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <span className="font-display font-semibold tracking-tight text-foreground sm:text-lg">
                  {item.examType.name}
                </span>
                <StatusBadge status={item.status} patient />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data do exame</span>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatDateTime(item.startsAt)}</p>
                </div>

                {item.hasPublishedReport ? (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-highlight-strong">
                      <FileCheck2 className="size-4 text-highlight" aria-hidden />
                      Laudo disponível
                    </span>
                    <Button asChild size="sm">
                      <Link to={`/meus-exames/${item.id}/laudo`} aria-label={`Ver laudo do exame ${item.examType.name}`}>
                        Ver laudo
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
