import { useRef, useState } from 'react';
import type { Patient } from '@drlaudo/contract';
import { useUpdatePatientMutation } from '../../app/api';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '../ui/alert-dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { getErrorMessage } from '../../lib/errors';

export function PatientActivityDialog({ patient, disabled, onSaved }: {
  patient: Patient;
  disabled: boolean;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [update, mutation] = useUpdatePatientMutation();
  const submitting = useRef(false);
  const action = patient.active ? 'Desativar paciente' : 'Reativar paciente';

  async function confirm() {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setError('');
    try {
      await update({ id: patient.id, active: !patient.active }).unwrap();
      setOpen(false);
      onSaved(patient.active ? 'Paciente desativado.' : 'Paciente reativado.');
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => {
      if (submitting.current) return;
      setOpen(next);
      if (next) { setError(''); onSaved(''); }
    }}>
      <AlertDialogTrigger asChild><Button variant="outline" disabled={disabled}>{action}</Button></AlertDialogTrigger>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (submitting.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{action}?</AlertDialogTitle>
          <AlertDialogDescription>
            {patient.active
              ? 'O paciente perderá o acesso à conta e não poderá receber novos agendamentos. O histórico de exames e laudos será preservado, sem cancelamento ou alteração. Você poderá reativá-lo depois.'
              : 'O paciente poderá entrar novamente na conta com a mesma senha e receber novos agendamentos. O histórico de exames e laudos será preservado, sem alteração.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-w-0 rounded-lg bg-muted p-4 text-sm">
          <p className="font-semibold">{patient.name}</p>
          <p className="mt-1 break-all text-muted-foreground">{patient.email}</p>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isLoading}>Voltar</AlertDialogCancel>
          <Button variant={patient.active ? 'destructive' : 'default'} disabled={mutation.isLoading || disabled} onClick={() => { void confirm(); }}>
            {mutation.isLoading ? 'Salvando…' : action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
