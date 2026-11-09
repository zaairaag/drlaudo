import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useGetMyReportQuery } from '../../app/api';
import { ReportViewer } from '../../components/product/ReportViewer';
import { EmptyState } from '../../components/product/EmptyState';
import { Button } from '../../components/ui/button';

export function PatientReportPage() {
  const { id } = useParams<{ id: string }>();
  const appointmentId = id ?? '';
  const query = useGetMyReportQuery(appointmentId, { skip: !appointmentId });

  const isNotFound = query.error && typeof query.error === 'object' && 'status' in query.error && query.error.status === 404;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-7">
      <nav className="flex items-center border-b pb-3" aria-label="Navegação do laudo">
        <Link
          className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          to="/meus-exames"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para meus exames
        </Link>
      </nav>

      {query.isFetching ? (
        <div className="rounded-xl border bg-card p-6 sm:p-8" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground">Carregando resultado do laudo…</p>
          <div className="mt-6 space-y-6" aria-hidden>
            <div className="space-y-3 border-b pb-6">
              <div className="h-7 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
            <div className="space-y-3">
              <div className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ) : isNotFound ? (
        <EmptyState
          title="Não encontramos este registro"
          description="O exame solicitado não possui um laudo publicado ou não pertence ao seu histórico."
          action={
            <Button asChild variant="outline">
              <Link to="/meus-exames">Voltar para meus exames</Link>
            </Button>
          }
        />
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-6 sm:p-8" role="alert">
          <p className="text-sm text-destructive">Não foi possível carregar seu laudo.</p>
          <Button variant="outline" className="mt-3" onClick={() => { void query.refetch(); }}>
            Tentar novamente
          </Button>
        </div>
      ) : query.currentData ? (
        <ReportViewer
          report={query.currentData}
          startsAt={query.currentData.startsAt}
          examName={query.currentData.examType.name}
        />
      ) : null}
    </div>
  );
}
