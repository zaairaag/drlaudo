import { Link } from 'react-router';
import { Calendar, FileCheck2, ArrowRight } from 'lucide-react';
import { useGetMyAppointmentsQuery } from '../../app/api';
import { PageHeader } from '../../components/product/PageHeader';
import { StatusBadge } from '../../components/product/StatusBadge';
import { EmptyState } from '../../components/product/EmptyState';
import { Button } from '../../components/ui/button';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { formatDateTime, formatMonth } from '../../lib/time';

export function MyAppointmentsPage() {
  const query = useGetMyAppointmentsQuery();
  const appointments = query.currentData ?? [];
  const months = new Map<string, typeof appointments>();
  for (const item of appointments) {
    const month = formatMonth(item.startsAt);
    const group = months.get(month);
    if (group) group.push(item);
    else months.set(month, [item]);
  }

  return (
    <div className="space-y-7 sm:space-y-8">
      <div className="space-y-3">
        <PageHeader
          title="Meus exames"
          description="Acompanhe seus agendamentos e consulte seus laudos publicados."
        />
        <TimezoneNote />
      </div>

      {query.isFetching ? (
        <div role="status" aria-live="polite">
          <p className="mb-5 text-sm text-muted-foreground">Carregando seus exames…</p>
          <div className="divide-y border-y" aria-hidden>
            {[1, 2, 3].map((key) => (
              <div key={key} className="space-y-4 py-7">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-6 sm:p-8" role="alert">
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
        <div className="space-y-8" aria-label="Histórico de exames">
          {[...months].map(([month, items], index) => (
            <section key={month} aria-labelledby={`exam-month-${index}`}>
              <h2 id={`exam-month-${index}`} className="mb-3 font-display text-xl font-semibold text-foreground">
                {month}
              </h2>
              <div className="divide-y border-y">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="py-6 sm:py-7"
                    tabIndex={-1}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
                      <h3 className="min-w-0 font-display text-lg font-semibold leading-snug tracking-tight text-foreground">
                        {item.examType.name}
                      </h3>
                      <StatusBadge status={item.status} patient />
                    </div>

                    <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Data do exame</p>
                        <time dateTime={item.startsAt} className="mt-1 block font-medium leading-6 tabular-nums text-foreground">{formatDateTime(item.startsAt)}</time>
                      </div>

                      {item.hasPublishedReport ? (
                        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-highlight-strong">
                            <FileCheck2 className="size-4" aria-hidden />
                            Laudo disponível
                          </span>
                          <Button asChild variant="outline" size="sm">
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
