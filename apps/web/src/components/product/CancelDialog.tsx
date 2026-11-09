import { useState } from 'react';
import { AlertDialog } from 'radix-ui';
import type { StaffAppointment } from '@drlaudo/contract';
import { Button } from '../ui/button';
import { formatDateTime } from '../../lib/time';

export function CancelDialog({ appointment, pending, onConfirm }: {
  appointment: StaffAppointment;
  pending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return <AlertDialog.Root open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
    <AlertDialog.Trigger asChild><Button variant="ghost" className="text-destructive" disabled={pending} aria-label={`Cancelar agendamento de ${appointment.patient.name}`}>Cancelar</Button></AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
        <AlertDialog.Title className="font-display text-xl font-semibold">Cancelar este agendamento?</AlertDialog.Title>
        <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">O cancelamento é definitivo e o horário ficará disponível.</AlertDialog.Description>
        <div className="my-5 rounded-lg bg-muted p-4 text-sm"><strong className="block">{appointment.patient.name}</strong><span className="block mt-1">{appointment.examType.name}</span><span className="block mt-2 tabular-nums">{formatDateTime(appointment.startsAt)}</span><span className="block text-xs text-muted-foreground">Horário de Brasília</span></div>
        {appointment.report?.status === 'DRAFT' && <p className="mb-5 text-sm text-warning">O rascunho será preservado e ficará bloqueado.</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <AlertDialog.Cancel asChild><Button variant="outline" disabled={pending}>Voltar</Button></AlertDialog.Cancel>
          <Button variant="destructive" disabled={pending} onClick={() => { void onConfirm().finally(() => setOpen(false)); }}>{pending ? 'Cancelando…' : 'Cancelar agendamento'}</Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
