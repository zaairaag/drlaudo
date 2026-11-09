import { useId, useState, type ComponentProps } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, UserRoundPen } from 'lucide-react';
import {
  CreatePatientRequestSchema, ErrorResponseSchema, UpdatePatientRequestSchema,
  type CreatePatientRequest, type Patient, type UpdatePatientRequest,
} from '@drlaudo/contract';
import { useCreatePatientMutation, useGetPatientsQuery, useUpdatePatientMutation } from '../../app/api';
import { PageHeader } from '../../components/product/PageHeader';
import { EmptyState } from '../../components/product/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import { getErrorMessage } from '../../lib/errors';

function PatientField({ label, error, message, hint, ...input }: ComponentProps<typeof Input> & {
  label: string; error: FieldError | undefined; message: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input {...input} id={id} aria-invalid={Boolean(error)} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />
      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error.type === 'server' ? error.message : message}</p>}
    </div>
  );
}

interface PatientFormActions {
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
  disabled: boolean;
}
function FormActions({ pending, editing, disabled }: { pending: boolean; editing: boolean; disabled: boolean }) {
  return (
    <DialogFooter>
      <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Voltar</Button></DialogClose>
      <Button type="submit" disabled={pending || disabled}>{pending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar paciente'}</Button>
    </DialogFooter>
  );
}

function CreatePatientForm({ onPendingChange, onSaved, disabled }: PatientFormActions) {
  const [create, mutation] = useCreatePatientMutation();
  const [error, setError] = useState('');
  const form = useForm<CreatePatientRequest>({ resolver: zodResolver(CreatePatientRequestSchema), defaultValues: { name: '', email: '', password: '' }, shouldFocusError: true });
  async function submit(values: CreatePatientRequest) {
    if (mutation.isLoading || disabled) return;
    setError(''); onPendingChange(true);
    try {
      await create(values).unwrap();
      form.reset();
      onSaved();
    } catch (cause) {
      const parsed = ErrorResponseSchema.safeParse(cause && typeof cause === 'object' && 'data' in cause ? cause.data : cause);
      if (parsed.success && parsed.data.error.code === 'EMAIL_TAKEN') {
        form.setError('email', { type: 'server', message: getErrorMessage(cause) }, { shouldFocus: true });
      } else if (parsed.success && parsed.data.error.code === 'VALIDATION_ERROR') {
        let focused = false;
        for (const issue of parsed.data.error.details) {
          const field = issue.path[0];
          if (issue.location === 'body' && (field === 'name' || field === 'email' || field === 'password')) {
            form.setError(field, { type: 'server', message: issue.message }, { shouldFocus: !focused });
            focused = true;
          }
        }
        if (!focused) setError(getErrorMessage(cause));
      } else setError(getErrorMessage(cause));
    } finally { onPendingChange(false); }
  }
  const errors = form.formState.errors;
  return (
    <form noValidate onSubmit={(event) => { void form.handleSubmit(submit)(event); }} className="flex min-w-0 flex-col gap-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <PatientField label="Nome" {...form.register('name')} autoComplete="name" disabled={mutation.isLoading || disabled} error={errors.name} message="Informe um nome de 3 a 120 caracteres." />
      <PatientField label="E-mail" {...form.register('email')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} disabled={mutation.isLoading || disabled} error={errors.email} message="Informe um e-mail válido de até 254 caracteres." />
      <PatientField label="Senha" {...form.register('password')} type="password" autoComplete="new-password" disabled={mutation.isLoading || disabled} error={errors.password} message="Use ao menos 8 caracteres e no máximo 72 bytes." hint="A senha é mantida exatamente como digitada: de 8 caracteres até 72 bytes." />
      <FormActions pending={mutation.isLoading} editing={false} disabled={disabled} />
    </form>
  );
}

function UpdatePatientForm({ patient, onPendingChange, onSaved, disabled }: PatientFormActions & { patient: Patient }) {
  const [update, mutation] = useUpdatePatientMutation();
  const [error, setError] = useState('');
  const form = useForm<UpdatePatientRequest>({ resolver: zodResolver(UpdatePatientRequestSchema), defaultValues: { name: patient.name, email: patient.email }, shouldFocusError: true });
  async function submit(values: UpdatePatientRequest) {
    if (mutation.isLoading || disabled) return;
    setError(''); onPendingChange(true);
    try {
      await update({ id: patient.id, ...values }).unwrap();
      onSaved();
    } catch (cause) {
      const parsed = ErrorResponseSchema.safeParse(cause && typeof cause === 'object' && 'data' in cause ? cause.data : cause);
      if (parsed.success && parsed.data.error.code === 'EMAIL_TAKEN') {
        form.setError('email', { type: 'server', message: getErrorMessage(cause) }, { shouldFocus: true });
      } else if (parsed.success && parsed.data.error.code === 'VALIDATION_ERROR') {
        let focused = false;
        for (const issue of parsed.data.error.details) {
          const field = issue.path[0];
          if (issue.location === 'body' && (field === 'name' || field === 'email')) {
            form.setError(field, { type: 'server', message: issue.message }, { shouldFocus: !focused });
            focused = true;
          }
        }
        if (!focused) setError(getErrorMessage(cause));
      } else setError(getErrorMessage(cause));
    } finally { onPendingChange(false); }
  }
  const errors = form.formState.errors;
  return (
    <form noValidate onSubmit={(event) => { void form.handleSubmit(submit)(event); }} className="flex min-w-0 flex-col gap-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <PatientField label="Nome" {...form.register('name')} autoComplete="name" disabled={mutation.isLoading || disabled} error={errors.name} message="Informe um nome de 3 a 120 caracteres." />
      <PatientField label="E-mail" {...form.register('email')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} disabled={mutation.isLoading || disabled} error={errors.email} message="Informe um e-mail válido de até 254 caracteres." />
      <FormActions pending={mutation.isLoading} editing disabled={disabled} />
    </form>
  );
}

function PatientDialog({ patient, disabled, onSaved }: { patient?: Patient; disabled: boolean; onSaved: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  function saved() {
    setOpen(false);
    onSaved(patient ? 'Dados do paciente atualizados.' : 'Paciente cadastrado.');
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant={patient ? 'outline' : 'default'}>
          {patient ? <UserRoundPen aria-hidden /> : <Plus aria-hidden />}{patient ? 'Editar paciente' : 'Novo paciente'}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{patient ? 'Editar paciente' : 'Novo paciente'}</DialogTitle>
          <DialogDescription>{patient ? 'Atualize nome e e-mail sem alterar a senha ou o histórico de exames.' : 'Cadastre o paciente para que a equipe possa agendar exames e ele possa acessar seus resultados.'}</DialogDescription>
        </DialogHeader>
        {disabled && <Alert variant="destructive"><AlertDescription>O catálogo de pacientes está indisponível. Volte à lista e tente carregá-lo novamente.</AlertDescription></Alert>}
        {open && (patient
          ? <UpdatePatientForm patient={patient} onPendingChange={setPending} onSaved={saved} disabled={disabled} />
          : <CreatePatientForm onPendingChange={setPending} onSaved={saved} disabled={disabled} />)}
      </DialogContent>
    </Dialog>
  );
}

export function PatientsPage() {
  const patients = useGetPatientsQuery();
  const [feedback, setFeedback] = useState('');
  const ready = patients.currentData !== undefined && !patients.isError;
  return (
    <div className="flex min-w-0 flex-col gap-7 sm:gap-8">
      <PageHeader title="Pacientes" description="Cadastre e mantenha os dados administrativos dos pacientes." actions={<PatientDialog disabled={!ready} onSaved={setFeedback} />} />
      {feedback && <p role="status" aria-live="polite" className="text-sm font-medium text-highlight-strong">{feedback}</p>}
      {patients.isError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os pacientes.</AlertTitle>
          <AlertDescription><Button variant="outline" className="mt-3" onClick={() => { void patients.refetch(); }}>Tentar novamente</Button></AlertDescription>
        </Alert>
      )}
      {!patients.currentData ? patients.isError ? null : (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Carregando pacientes…</p>
          {[1, 2, 3].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
        </div>
      ) : patients.currentData.length === 0 ? (
        <EmptyState title="Nenhum paciente cadastrado." description="Use Novo paciente para cadastrar o primeiro paciente." />
      ) : (
        <section aria-label="Pacientes cadastrados" aria-busy={patients.isFetching} className="min-w-0 rounded-xl border bg-card">
          <ul className="divide-y">
            {patients.currentData.map((patient) => (
              <li key={patient.id} data-patient-id={patient.id} className="flex min-w-0 flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold leading-6">{patient.name}</h2>
                  <p className="mt-1 break-all text-sm leading-6 text-muted-foreground">{patient.email}</p>
                </div>
                <PatientDialog patient={patient} disabled={!ready} onSaved={setFeedback} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">Os pacientes não são excluídos para preservar o histórico de exames e laudos.</p>
    </div>
  );
}
