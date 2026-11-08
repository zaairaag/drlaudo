import { useEffect, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { AlertDialog } from 'radix-ui';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateReportRequest, StaffReport } from '@drlaudo/contract';
import {
  useCreateReportMutation,
  useGetAppointmentQuery,
  useGetReportQuery,
  usePublishReportMutation,
  useUpdateReportMutation,
} from '../../app/api';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/product/EmptyState';
import { PageHeader } from '../../components/product/PageHeader';
import { PublishDialog } from '../../components/product/PublishDialog';
import { ReportEditor } from '../../components/product/ReportEditor';
import { ReportViewer } from '../../components/product/ReportViewer';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { formatDateTime } from '../../lib/time';
import { getErrorMessage } from '../../lib/errors';

export function ReportPage() {
  const { id } = useParams<{ id: string }>();

  // Consultas independentes com reconciliação estrita
  const appointmentQuery = useGetAppointmentQuery(id ?? '', { skip: !id });
  const reportQuery = useGetReportQuery(id ?? '', { skip: !id });

  const [createReport, creation] = useCreateReportMutation();
  const [updateReport, updating] = useUpdateReportMutation();
  const [publishReport, publishing] = usePublishReportMutation();

  const [formDirty, setFormDirty] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [unsavedEdits, setUnsavedEdits] = useState<CreateReportRequest | null>(null);
  const [lastSavedReport, setLastSavedReport] = useState<StaffReport | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Limpa estados ao trocar de id de rota
  useEffect(() => {
    setFormDirty(false);
    setReconciling(false);
    setPublishDialogOpen(false);
    setMutationError(null);
    setUnsavedEdits(null);
    setLastSavedReport(null);
    setFeedback(null);
  }, [id]);

  const isSaving = creation.isLoading || updating.isLoading;
  const isPublishing = publishing.isLoading;
  const isPending = isSaving || isPublishing || reconciling;

  // useBlocker: impede perda de dados por navegação interna
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (formDirty || isPending) && currentLocation.pathname !== nextLocation.pathname,
  );

  // Se a navegação foi bloqueada durante envio pendente, reseta imediatamente
  useEffect(() => {
    if (blocker.state === 'blocked' && isPending) {
      blocker.reset();
    }
  }, [blocker, isPending]);

  // beforeunload: alerta nativo do navegador ao fechar aba ou dar F5 com dirty
  useEffect(() => {
    if (!formDirty && !isPending) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formDirty, isPending]);

  async function handleRetryBoth() {
    setReconciling(true);
    try {
      await Promise.all([appointmentQuery.refetch(), reportQuery.refetch()]);
    } finally {
      setReconciling(false);
    }
  }

  async function handleSave(values: CreateReportRequest) {
    if (isPending || !appointmentQuery.currentData) return;
    setMutationError(null);
    const appointment = appointmentQuery.currentData;
    const currentReport = lastSavedReport ?? reportQuery.currentData ?? null;

    try {
      let saved: StaffReport;
      if (currentReport === null) {
        saved = await createReport({
          appointmentId: appointment.id,
          ...values,
        }).unwrap();
      } else {
        saved = await updateReport({
          id: currentReport.id,
          ...values,
        }).unwrap();
      }
      setLastSavedReport(saved);
      setFormDirty(false);
      setUnsavedEdits(null);
      setFeedback('Rascunho salvo.');
      toast.success('Rascunho salvo.');
    } catch (cause) {
      const message = getErrorMessage(cause);
      setMutationError(message);
      toast.error(message);
      // Preserva o texto digitado em memória
      setUnsavedEdits(values);
      // Reconcilia detalhe e laudo
      await handleRetryBoth();
    }
  }

  async function handlePublish() {
    const currentReport = lastSavedReport ?? reportQuery.currentData;
    if (isPending || !currentReport) return;
    setMutationError(null);

    try {
      const published = await publishReport(currentReport.id).unwrap();
      setLastSavedReport(published);
      setFormDirty(false);
      setPublishDialogOpen(false);
      setFeedback('Laudo publicado.');
      toast.success('Laudo publicado.');
    } catch (cause) {
      const message = getErrorMessage(cause);
      setMutationError(message);
      toast.error(message);
      await handleRetryBoth();
    }
  }

  if (!id) {
    return (
      <EmptyState
        title="Não encontramos este registro"
        description="Identificador de agendamento não informado."
        action={
          <Button asChild>
            <Link to="/agenda">Voltar para a agenda</Link>
          </Button>
        }
      />
    );
  }

  // Se detalhe está carregando sem dados
  if (appointmentQuery.isFetching && !appointmentQuery.currentData) {
    return (
      <div role="status" aria-live="polite" className="p-8 text-center text-muted-foreground">
        Carregando agendamento…
      </div>
    );
  }

  // Se detalhe falhou
  if (appointmentQuery.isError) {
    const status = appointmentQuery.error && 'status' in appointmentQuery.error ? appointmentQuery.error.status : 500;
    if (status === 404) {
      return (
        <EmptyState
          title="Não encontramos este registro"
          description="O agendamento solicitado não foi encontrado."
          action={
            <Button asChild>
              <Link to="/agenda">Voltar para a agenda</Link>
            </Button>
          }
        />
      );
    }
    return (
      <div role="alert" className="p-8 text-center">
        <p className="text-sm text-destructive">Algo deu errado. Tente novamente em instantes.</p>
        <Button variant="outline" className="mt-4" onClick={() => void handleRetryBoth()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const appointment = appointmentQuery.currentData;
  if (!appointment) return null;

  // Reconciliação do laudo
  const hasReportSummary = appointment.report !== null;
  const isReportQueryLoading = reportQuery.isFetching && !reportQuery.currentData;
  const isReportQuery404 =
    reportQuery.isError &&
    reportQuery.error !== undefined &&
    typeof reportQuery.error === 'object' &&
    reportQuery.error !== null &&
    'status' in reportQuery.error &&
    reportQuery.error.status === 404;

  // Se agendamento tem resumo de laudo mas GET /report deu 404 ou 500: inconsistência!
  if (hasReportSummary && reportQuery.isError) {
    return (
      <div role="alert" className="p-8 text-center">
        <p className="text-sm text-destructive">
          Inconsistência na recuperação do laudo. Não foi possível carregar os dados.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void handleRetryBoth()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Se agendamento não tem laudo, mas GET /report deu erro diferente de 404 (ex: 500)
  if (!hasReportSummary && reportQuery.isError && !isReportQuery404) {
    return (
      <div role="alert" className="p-8 text-center">
        <p className="text-sm text-destructive">
          Não foi possível carregar os dados do laudo. Tente novamente.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void handleRetryBoth()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Aguarda carregamento do laudo quando necessário
  if (isReportQueryLoading) {
    return (
      <div role="status" aria-live="polite" className="p-8 text-center text-muted-foreground">
        Carregando laudo…
      </div>
    );
  }

  const resolvedReport: StaffReport | null =
    lastSavedReport ?? (hasReportSummary ? reportQuery.currentData ?? null : null);

  // Caso 1: Agendamento cancelado
  if (appointment.status === 'CANCELED') {
    return (
      <div className="space-y-6">
        <Link
          to="/agenda"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Voltar para agenda
        </Link>
        <PageHeader
          title="Agendamento cancelado"
          description="Este agendamento foi cancelado e não admite novos laudos."
        />

        <div className="rounded-xl border bg-card p-6 text-sm">
          <strong className="block text-foreground">{appointment.patient.name}</strong>
          <span className="mt-1 block text-foreground">{appointment.examType.name}</span>
          <span className="mt-2 block tabular-nums text-foreground">
            {formatDateTime(appointment.startsAt)}
          </span>
          <TimezoneNote />
        </div>

        {resolvedReport ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-lg bg-warning-soft p-4 text-sm text-warning font-medium">
              O agendamento foi cancelado; o laudo está bloqueado.
            </p>
            {unsavedEdits && (
              <div role="alert" className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Alterações não salvas preservadas em memória:</p>
                <p className="mt-1"><strong>Título:</strong> {unsavedEdits.title}</p>
                <p className="mt-1"><strong>Profissional:</strong> {unsavedEdits.professionalName}</p>
                <div className="mt-2 whitespace-pre-wrap">{unsavedEdits.body}</div>
              </div>
            )}
            <ReportViewer
              report={resolvedReport}
              startsAt={appointment.startsAt}
              examName={appointment.examType.name}
            />
          </div>
        ) : (
          <p role="alert" className="rounded-lg bg-warning-soft p-4 text-sm text-warning font-medium">
            Agendamento cancelado. Não é possível cadastrar laudo.
          </p>
        )}
      </div>
    );
  }

  // Caso 2: Laudo já publicado (modo de leitura imutável)
  if (resolvedReport?.status === 'PUBLISHED') {
    return (
      <div className="space-y-6">
        <Link
          to="/agenda"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Voltar para agenda
        </Link>
        <PageHeader
          title="Laudo do exame"
          description="Resultado final publicado e disponível ao paciente."
        />
        <p role="alert" className="rounded-lg bg-muted p-4 text-sm text-muted-foreground font-medium">
          Este laudo foi publicado e não pode ser alterado.
        </p>
        {feedback && (
          <p role="status" aria-live="polite" className="text-sm font-medium text-highlight-strong">
            {feedback}
          </p>
        )}
        <ReportViewer
          report={resolvedReport}
          startsAt={appointment.startsAt}
          examName={appointment.examType.name}
        />
      </div>
    );
  }

  // Caso 3: SCHEDULED com formulário de criação ou edição de DRAFT
  return (
    <div className="space-y-6">
      <Link
        to="/agenda"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Voltar para agenda
      </Link>

      <PageHeader
        title={resolvedReport ? 'Editar laudo' : 'Criar laudo'}
        description="Escreva, salve o rascunho e publique o resultado para o paciente."
      />

      <div className="rounded-xl border bg-card p-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong className="block text-base text-foreground">{appointment.patient.name}</strong>
            <span className="mt-1 block text-muted-foreground">{appointment.examType.name}</span>
          </div>
          <div className="text-right">
            <span className="block tabular-nums font-medium text-foreground">
              {formatDateTime(appointment.startsAt)}
            </span>
            <TimezoneNote />
          </div>
        </div>
      </div>

      {mutationError && (
        <p role="alert" className="rounded-lg bg-destructive-soft p-4 text-sm text-destructive">
          {mutationError}
        </p>
      )}
      {feedback && (
        <p role="status" aria-live="polite" className="text-sm font-medium text-highlight-strong">
          {feedback}
        </p>
      )}
      <ReportEditor
        key={`${appointment.id}-${resolvedReport?.id ?? 'new'}`}
        appointment={appointment}
        report={resolvedReport}
        isSaving={isSaving}
        isPublishing={isPublishing}
        reconciling={reconciling}
        onSave={handleSave}
        onPublishClick={() => setPublishDialogOpen(true)}
        onDirtyChange={setFormDirty}
        initialValues={unsavedEdits}
      />

      {/* Diálogo de confirmação de publicação */}
      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        appointment={appointment}
        pending={isPublishing}
        onConfirm={handlePublish}
      />

      {/* Diálogo de confirmação de descarte de alterações na navegação interna */}
      <AlertDialog.Root
        open={blocker.state === 'blocked' && formDirty && !isPending}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl">
            <AlertDialog.Title className="font-display text-xl font-semibold">
              Descartar alterações?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Você tem alterações não salvas no laudo. Se sair, essas alterações serão perdidas.
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-3 pt-4">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
                  Continuar editando
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="destructive" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
                  Descartar alterações
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
