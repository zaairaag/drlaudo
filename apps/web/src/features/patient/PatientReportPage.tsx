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
    <div className="space-y-6">
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        to="/meus-exames"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para meus exames
      </Link>

      {query.isFetching ? (
        <div className="space-y-4 rounded-xl border bg-card p-8" role="status" aria-live="polite">
          <span className="text-sm text-muted-foreground">Carregando resultado do laudo…</span>
          <div className="h-8 w-1/3 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
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
        <div className="rounded-xl border bg-card p-6" role="alert">
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
