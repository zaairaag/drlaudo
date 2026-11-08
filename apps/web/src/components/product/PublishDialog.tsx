import { AlertDialog } from 'radix-ui';
import type { StaffAppointment } from '@drlaudo/contract';
import { Button } from '../ui/button';
import { formatDateTime } from '../../lib/time';

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: StaffAppointment;
  pending: boolean;
  onConfirm: () => Promise<void>;
}

export function PublishDialog({
  open,
  onOpenChange,
  appointment,
  pending,
  onConfirm,
}: PublishDialogProps) {
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
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl"
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <AlertDialog.Title className="font-display text-xl font-semibold">
            Publicar laudo?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Depois de publicado, o laudo não poderá ser editado.
          </AlertDialog.Description>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            O paciente poderá consultar este laudo.
          </p>

          <div className="my-5 rounded-lg bg-muted p-4 text-sm">
            <strong className="block text-foreground">{appointment.patient.name}</strong>
            <span className="mt-1 block text-foreground">{appointment.examType.name}</span>
            <span className="mt-2 block tabular-nums text-foreground">
              {formatDateTime(appointment.startsAt)}
            </span>
            <span className="block text-xs text-muted-foreground">Horário de Brasília</span>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Voltar
              </Button>
            </AlertDialog.Cancel>
            <Button
              disabled={pending}
              onClick={() => {
                void onConfirm();
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
