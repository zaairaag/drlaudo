import { AlertDialog } from 'radix-ui';
import type { StaffAppointment, StaffReport } from '@drlaudo/contract';
import { Button } from '../ui/button';
import { formatDateTime } from '../../lib/time';

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: StaffAppointment;
  /** Último DTO salvo ou reconciliado deste agendamento, nunca valores locais do editor. */
  savedReport: StaffReport | null;
  pending: boolean;
  onConfirm: () => Promise<void>;
}

export function PublishDialog({
  open,
  onOpenChange,
  appointment,
  savedReport,
  pending,
  onConfirm,
}: PublishDialogProps) {
  const draft = savedReport?.status === 'DRAFT' && savedReport.appointmentId === appointment.id
    ? savedReport
    : null;
  const canConfirm = draft !== null && appointment.status === 'SCHEDULED' && !pending;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            const trigger = document.getElementById('report-publish-trigger');
            if (trigger && typeof trigger.focus === 'function') {
              event.preventDefault();
              trigger.focus();
            }
          }}
        >
          <div className="shrink-0 p-5 pb-4 sm:px-6 sm:pt-6">
            <AlertDialog.Title className="font-display text-xl font-semibold">
              Publicar laudo?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Depois de publicado, o laudo não poderá ser editado.
            </AlertDialog.Description>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              O paciente poderá consultar este laudo.
            </p>
          </div>

          <div
            role="region"
            aria-label="Rascunho salvo para revisão"
            tabIndex={0}
            className="min-h-0 overflow-y-auto overscroll-contain break-words px-5 pb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
          >
            <div className="rounded-lg bg-muted p-4 text-sm">
              <strong className="block text-foreground">{appointment.patient.name}</strong>
              <span className="mt-1 block text-foreground">{appointment.examType.name}</span>
              <span className="mt-2 block tabular-nums text-foreground">
                {formatDateTime(appointment.startsAt)}
              </span>
              <span className="block text-xs text-muted-foreground">Horário de Brasília</span>
            </div>

            {draft ? (
              <section className="mt-5">
                <h3 className="font-display text-xl font-semibold leading-snug text-foreground">
                  {draft.title}
                </h3>
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  Profissional responsável
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{draft.professionalName}</p>
                <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {draft.body}
                </div>
              </section>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Não há rascunho salvo disponível para publicação.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-5 sm:px-6">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Voltar
              </Button>
            </AlertDialog.Cancel>
            <Button
              disabled={!canConfirm}
              onClick={() => {
                if (canConfirm) void onConfirm();
              }}
            >
              {pending ? 'Publicando…' : 'Publicar laudo'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
