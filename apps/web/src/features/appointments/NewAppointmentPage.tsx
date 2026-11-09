import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CreateAppointmentRequestSchema, LocalDateSchema, UUIDSchema, type CreateAppointmentRequest } from '@drlaudo/contract';
import { api, useCreateAppointmentMutation, useGetExamTypesQuery, useGetPatientsQuery, useGetSlotsQuery } from '../../app/api';
import { useAppStore } from '../../app/hooks';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { PageHeader } from '../../components/product/PageHeader';
import { SlotGrid } from '../../components/product/SlotGrid';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { formatTime, todayDate } from '../../lib/time';
import { getErrorMessage } from '../../lib/errors';

export function NewAppointmentPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayDate();
  const validDate = LocalDateSchema.safeParse(date).success && params.getAll('date').length <= 1;
  const returnPatient = UUIDSchema.safeParse(params.get('patientId'));
  const returnPatientId = returnPatient.success && params.getAll('patientId').length === 1 ? returnPatient.data : '';
  const navigate = useNavigate();
  const store = useAppStore();
  const patients = useGetPatientsQuery();
  const examTypes = useGetExamTypesQuery();
  const slots = useGetSlotsQuery({ date }, { skip: !validDate });
  const [create, creation] = useCreateAppointmentMutation();
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<{ values: CreateAppointmentRequest; date: string; generation: number; uncertain: boolean } | null>(null);
  const form = useForm<CreateAppointmentRequest>({ resolver: zodResolver(CreateAppointmentRequestSchema), defaultValues: { patientId: '', examTypeId: '', startsAt: '' }, shouldFocusError: true });
  const patientId = form.watch('patientId');
  const examTypeId = form.watch('examTypeId');
  const startsAt = form.watch('startsAt');
  const disabled = creation.isLoading || reconciling || pendingAttempt !== null;
  const catalogsReady = patients.currentData !== undefined && !patients.isError
    && examTypes.currentData !== undefined && !examTypes.isError;
  const selectedUnavailable = Boolean(startsAt) && !slots.currentData?.slots.some((slot) => slot.startsAt === startsAt && slot.available);

  async function reconcileCreation(attempt: NonNullable<typeof pendingAttempt>) {
    setReconciling(true);
    try {
      // A pre-mutation request can still be running; forceRefetch alone joins it.
      await Promise.all([
        store.dispatch(api.util.getRunningQueryThunk('getAppointments', { date: attempt.date })),
        store.dispatch(api.util.getRunningQueryThunk('getSlots', { date: attempt.date })),
      ]);
      if (store.getState().auth.generation !== attempt.generation) return;
      const [agenda, availability] = await Promise.allSettled([
        store.dispatch(api.endpoints.getAppointments.initiate({ date: attempt.date }, { subscribe: false, forceRefetch: true })).unwrap(),
        store.dispatch(api.endpoints.getSlots.initiate({ date: attempt.date }, { subscribe: false, forceRefetch: true })).unwrap(),
      ]);
      if (store.getState().auth.generation !== attempt.generation) return;
      if (agenda.status === 'rejected' || availability.status === 'rejected') {
        setError('Não foi possível conferir o resultado do agendamento. Confira novamente antes de agendar outro exame.');
        return;
      }
      const candidate = agenda.value.find((item) => item.status === 'SCHEDULED'
        && item.startsAt === attempt.values.startsAt);
      if (candidate) {
        await store.dispatch(api.util.getRunningQueryThunk('getAppointment', candidate.id));
        if (store.getState().auth.generation !== attempt.generation) return;
        const detail = await store.dispatch(api.endpoints.getAppointment.initiate(candidate.id, { subscribe: false, forceRefetch: true })).unwrap();
        if (store.getState().auth.generation !== attempt.generation) return;
        if (attempt.uncertain && detail.status === 'SCHEDULED' && detail.startsAt === attempt.values.startsAt
          && detail.patient.id === attempt.values.patientId && detail.examType.id === attempt.values.examTypeId) {
          setPendingAttempt(null);
          void navigate(`/agenda?date=${encodeURIComponent(attempt.date)}&focus=${encodeURIComponent(detail.id)}`, { state: { createdAppointmentId: detail.id } });
          return;
        }
      }
      setPendingAttempt(null);
    } catch {
      if (store.getState().auth.generation === attempt.generation) {
        setError('Não foi possível conferir o resultado do agendamento. Confira novamente antes de agendar outro exame.');
      }
    } finally {
      if (store.getState().auth.generation === attempt.generation) setReconciling(false);
    }
  }

  async function submit(values: CreateAppointmentRequest) {
    if (disabled || !catalogsReady || !validDate || slots.isFetching || slots.isError || !slots.currentData || selectedUnavailable) return;
    setError('');
    const generation = store.getState().auth.generation;
    try {
      const item = await create(values).unwrap();
      if (store.getState().auth.generation !== generation) return;
      void navigate(`/agenda?date=${encodeURIComponent(date)}&focus=${encodeURIComponent(item.id)}`, { state: { createdAppointmentId: item.id } });
    } catch (cause) {
      if (store.getState().auth.generation !== generation) return;
      const message = getErrorMessage(cause);
      setError(message); toast.error(message);
      const status = cause && typeof cause === 'object' && 'status' in cause ? cause.status : 'FETCH_ERROR';
      const attempt = { values, date, generation, uncertain: status === 'FETCH_ERROR' || (typeof status === 'number' && status >= 500) };
      setPendingAttempt(attempt);
      await reconcileCreation(attempt);
    }
  }
  function changeDate(value: string) {
    setParams({ date: value, ...(returnPatientId ? { patientId: returnPatientId } : {}) }, { replace: true });
    form.setValue('startsAt', ''); setError('');
  }
  const errors = form.formState.errors;
  const hasFree = slots.currentData?.slots.some((slot) => slot.available);
  const selectedPatient = patients.currentData?.find((item) => item.id === patientId);
  const selectedExam = examTypes.currentData?.find((item) => item.id === examTypeId);
  return (
    <div className="space-y-7 sm:space-y-8">
      <div className="space-y-2">
        <Link className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary" to={`/agenda?${new URLSearchParams({ date: validDate ? date : todayDate(), ...(returnPatientId ? { patientId: returnPatientId } : {}) })}`}><ChevronLeft className="size-4" aria-hidden />Voltar para agenda</Link>
        <PageHeader title="Novo agendamento" description="Escolha o paciente, o exame e o melhor horário." />
      </div>

      <form onSubmit={(event) => { void form.handleSubmit(submit)(event); }} noValidate>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
          <div className="min-w-0 divide-y rounded-xl border bg-card">
            <section className="p-5 sm:p-7" aria-labelledby="appointment-details-title">
              <h2 id="appointment-details-title" className="mb-6 flex items-baseline gap-3 font-display text-lg font-semibold tracking-tight"><span className="font-sans text-sm font-medium tabular-nums text-muted-foreground" aria-hidden>1.</span>Paciente e exame</h2>
              {Object.keys(errors).length > 0 && <p role="alert" className="mb-5 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">Confira os campos indicados antes de agendar.</p>}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="new-patient">Paciente</Label>
                  <Select id="new-patient" {...form.register('patientId')} disabled={disabled || patients.isFetching || patients.isError} aria-invalid={!!errors.patientId} aria-describedby={errors.patientId ? 'patient-error' : undefined}>
                    <option value="">Selecione um paciente</option>
                    {patients.currentData?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
                  </Select>
                  {errors.patientId && <p id="patient-error" className="text-sm text-destructive">Selecione um paciente.</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="new-exam">Exame</Label>
                  <Select id="new-exam" {...form.register('examTypeId')} disabled={disabled || examTypes.isFetching || examTypes.isError} aria-invalid={!!errors.examTypeId} aria-describedby={errors.examTypeId ? 'exam-error' : undefined}>
                    <option value="">Selecione um exame</option>
                    {examTypes.currentData?.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
                  </Select>
                  {errors.examTypeId && <p id="exam-error" className="text-sm text-destructive">Selecione um exame.</p>}
                </div>
              </div>
              {(patients.isError || examTypes.isError) && <div role="alert" className="mt-5"><p className="text-sm text-destructive">Não foi possível carregar pacientes ou exames.</p><Button type="button" variant="outline" className="mt-3" onClick={() => { void patients.refetch(); void examTypes.refetch(); }}>Tentar novamente</Button></div>}
            </section>

            <section className="p-5 sm:p-7" aria-labelledby="appointment-slot-title">
              <h2 id="appointment-slot-title" className="mb-6 flex items-baseline gap-3 font-display text-lg font-semibold tracking-tight"><span className="font-sans text-sm font-medium tabular-nums text-muted-foreground" aria-hidden>2.</span>Data e horário</h2>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="w-full max-w-xs space-y-2">
                  <Label htmlFor="new-date">Data</Label>
                  <Input id="new-date" className="font-medium tabular-nums" type="date" min="0001-01-01" max="9999-12-31" value={date} disabled={disabled} onChange={(event) => changeDate(event.target.value)} aria-invalid={!validDate} aria-describedby={!validDate ? 'date-error' : undefined} />
                  {!validDate && <p id="date-error" role="alert" className="text-sm text-destructive">Informe uma data válida.</p>}
                </div>
                <div className="pb-1"><TimezoneNote /></div>
              </div>
              {!validDate ? (
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">Escolha uma data para consultar os horários.</p>
              ) : slots.isFetching ? (
                <p className="mt-6 text-sm text-muted-foreground" role="status">Carregando horários disponíveis…</p>
              ) : slots.isError ? (
                <div className="mt-6" role="alert"><p className="text-sm text-destructive">Não foi possível carregar os horários.</p><Button type="button" variant="outline" className="mt-3" onClick={() => { void slots.refetch(); }}>Tentar novamente</Button></div>
              ) : slots.currentData ? (
                <div className="mt-6 space-y-5">
                  <SlotGrid className="[&_[data-slot=slot-grid]]:grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))]" slots={slots.currentData.slots} value={startsAt} onChange={(value) => { form.setValue('startsAt', value, { shouldValidate: true }); setError(''); }} disabled={disabled} />
                  {!hasFree && <p className="text-sm leading-relaxed text-muted-foreground">Não há horários disponíveis nesta data. Escolha outra data.</p>}
                  <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm border border-input bg-card" aria-hidden />Disponível</span>
                    <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-primary" aria-hidden />Selecionado</span>
                    <span className="inline-flex items-center gap-2"><span className="h-px w-3 bg-muted-foreground" aria-hidden />Ocupado ou passado</span>
                  </div>
                </div>
              ) : null}
              {errors.startsAt && <p role="alert" className="mt-5 text-sm text-destructive">Selecione um horário disponível.</p>}
            </section>
          </div>

          <aside className="min-w-0 rounded-xl bg-muted/60 p-5 sm:p-6 lg:sticky lg:top-8" aria-label="Resumo do agendamento">
            <h2 className="font-display text-lg font-semibold tracking-tight">Resumo do agendamento</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Confira os detalhes antes de confirmar.</p>
            <dl className="my-6 space-y-5 border-y py-5 text-sm">
              <div><dt className="text-xs text-muted-foreground">Paciente</dt><dd className="mt-1 break-words font-medium leading-6">{selectedPatient?.name ?? 'Ainda não selecionado'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Exame</dt><dd className="mt-1 break-words font-medium leading-6">{selectedExam?.name ?? 'Ainda não selecionado'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Data e horário</dt><dd className="mt-1 font-medium leading-6 tabular-nums">{validDate ? date.split('-').reverse().join('/') : 'Escolha uma data'}{startsAt ? ` às ${formatTime(startsAt)}` : ''}</dd></div>
              <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">Duração</dt><dd>30 minutos</dd></div>
            </dl>
            {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
            {pendingAttempt && !reconciling && <Button type="button" variant="outline" className="mb-4 w-full" onClick={() => void reconcileCreation(pendingAttempt)}>Conferir agendamento</Button>}
            <Button type="submit" className="w-full" disabled={disabled || !catalogsReady || !validDate || slots.isFetching || slots.isError || selectedUnavailable}><Check className="size-4" aria-hidden />{creation.isLoading || reconciling ? 'Agendando…' : 'Agendar exame'}</Button>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">A disponibilidade é confirmada ao concluir o agendamento.</p>
          </aside>
        </div>
      </form>
    </div>
  );
}
