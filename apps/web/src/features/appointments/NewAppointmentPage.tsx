import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CreateAppointmentRequestSchema, LocalDateSchema, type CreateAppointmentRequest } from '@drlaudo/contract';
import { useCreateAppointmentMutation, useGetExamTypesQuery, useGetPatientsQuery, useGetSlotsQuery } from '../../app/api';
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
  const navigate = useNavigate();
  const patients = useGetPatientsQuery();
  const examTypes = useGetExamTypesQuery();
  const slots = useGetSlotsQuery({ date }, { skip: !validDate });
  const [create, creation] = useCreateAppointmentMutation();
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const form = useForm<CreateAppointmentRequest>({ resolver: zodResolver(CreateAppointmentRequestSchema), defaultValues: { patientId: '', examTypeId: '', startsAt: '' }, shouldFocusError: true });
  const patientId = form.watch('patientId');
  const examTypeId = form.watch('examTypeId');
  const startsAt = form.watch('startsAt');
  const disabled = creation.isLoading || reconciling;
  async function submit(values: CreateAppointmentRequest) {
    if (disabled || !validDate || slots.isFetching || !slots.currentData) return;
    setError('');
    try {
      const item = await create(values).unwrap();
      toast.success('Exame agendado.');
      navigate(`/agenda?date=${encodeURIComponent(date)}&focus=${encodeURIComponent(item.id)}`, { state: { message: 'Exame agendado.' } });
    } catch (cause) {
      const message = getErrorMessage(cause);
      setError(message); toast.error(message);
      form.setValue('startsAt', '');
      setReconciling(true);
      try { await slots.refetch(); } finally { setReconciling(false); }
    }
  }
  function changeDate(value: string) {
    setParams({ date: value }, { replace: true });
    form.setValue('startsAt', ''); setError('');
  }
  const errors = form.formState.errors;
  const hasFree = slots.currentData?.slots.some((slot) => slot.available);
  const selectedPatient = patients.currentData?.find((item) => item.id === patientId);
  const selectedExam = examTypes.currentData?.find((item) => item.id === examTypeId);
  return <div className="space-y-6">
    <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary" to={`/agenda?date=${encodeURIComponent(validDate ? date : todayDate())}`}><ChevronLeft className="size-4" aria-hidden />Voltar para agenda</Link>
    <PageHeader title="Novo agendamento" description="Escolha o paciente, o exame e o melhor horário." />
    <form onSubmit={(event) => { void form.handleSubmit(submit)(event); }} noValidate>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-6"><div className="mb-6 flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">1</span><h2 className="font-display text-lg font-semibold">Paciente e exame</h2></div>
            {Object.keys(errors).length > 0 && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">Confira os campos indicados antes de agendar.</p>}
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-patient">Paciente</Label><Select id="new-patient" {...form.register('patientId')} disabled={disabled || patients.isFetching || patients.isError} aria-invalid={!!errors.patientId} aria-describedby={errors.patientId ? 'patient-error' : undefined}><option value="">Selecione um paciente</option>{patients.currentData?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</Select>{errors.patientId && <p id="patient-error" className="text-sm text-destructive">Selecione um paciente.</p>}</div>
            <div className="space-y-2"><Label htmlFor="new-exam">Exame</Label><Select id="new-exam" {...form.register('examTypeId')} disabled={disabled || examTypes.isFetching || examTypes.isError} aria-invalid={!!errors.examTypeId} aria-describedby={errors.examTypeId ? 'exam-error' : undefined}><option value="">Selecione um exame</option>{examTypes.currentData?.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</Select>{errors.examTypeId && <p id="exam-error" className="text-sm text-destructive">Selecione um exame.</p>}</div></div>
            {(patients.isError || examTypes.isError) && <div role="alert" className="mt-4"><p className="text-sm text-destructive">Não foi possível carregar pacientes ou exames.</p><Button type="button" variant="outline" className="mt-2" onClick={() => { void patients.refetch(); void examTypes.refetch(); }}>Tentar novamente</Button></div>}
          </section>
          <section className="rounded-xl border bg-card p-6"><div className="mb-6 flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">2</span><h2 className="font-display text-lg font-semibold">Data e horário</h2></div>
            <div className="max-w-xs space-y-2"><Label htmlFor="new-date">Data</Label><Input id="new-date" type="date" min="0001-01-01" max="9999-12-31" value={date} disabled={disabled} onChange={(event) => changeDate(event.target.value)} aria-invalid={!validDate} aria-describedby={!validDate ? 'date-error' : undefined} />{!validDate && <p id="date-error" role="alert" className="text-sm text-destructive">Informe uma data válida.</p>}</div>
            <div className="mt-5"><TimezoneNote /></div>
            {!validDate ? <p className="mt-5 text-sm text-muted-foreground">Escolha uma data para consultar os horários.</p>
              : slots.isFetching ? <p className="mt-5 text-sm text-muted-foreground" role="status">Carregando horários disponíveis…</p>
              : slots.isError ? <div className="mt-5" role="alert"><p className="text-sm text-destructive">Não foi possível carregar os horários.</p><Button type="button" variant="outline" className="mt-3" onClick={() => { void slots.refetch(); }}>Tentar novamente</Button></div>
              : slots.currentData ? <div className="mt-5 space-y-4"><SlotGrid slots={slots.currentData.slots} value={startsAt} onChange={(value) => { form.setValue('startsAt', value, { shouldValidate: true }); setError(''); }} disabled={disabled} />{!hasFree && <p className="text-sm text-muted-foreground">Não há horários disponíveis nesta data. Escolha outra data.</p>}<div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>○ Disponível</span><span>● Selecionado</span><span>— Ocupado ou passado</span></div></div> : null}
            {errors.startsAt && <p role="alert" className="mt-4 text-sm text-destructive">Selecione um horário disponível.</p>}
          </section>
        </div>
        <aside className="rounded-xl border bg-card p-6 lg:sticky lg:top-6" aria-label="Resumo do agendamento"><CalendarPlus className="mb-4 size-7 text-primary" aria-hidden /><h2 className="font-display text-lg font-semibold">Tudo pronto para agendar?</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Confira os detalhes antes de confirmar.</p><dl className="my-6 space-y-4 border-y py-5 text-sm"><div><dt className="text-muted-foreground">Paciente</dt><dd className="mt-1 font-medium">{selectedPatient?.name ?? 'Ainda não selecionado'}</dd></div><div><dt className="text-muted-foreground">Exame</dt><dd className="mt-1 font-medium">{selectedExam?.name ?? 'Ainda não selecionado'}</dd></div><div><dt className="text-muted-foreground">Data e horário</dt><dd className="mt-1 font-medium tabular-nums">{validDate ? date.split('-').reverse().join('/') : 'Escolha uma data'}{startsAt ? ` às ${formatTime(startsAt)}` : ''}</dd></div><div><dt className="text-muted-foreground">Duração</dt><dd className="mt-1">30 minutos</dd></div></dl>
          {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={disabled || !validDate || slots.isFetching || slots.isError || patients.isError || examTypes.isError}><Check className="size-4" aria-hidden />{disabled ? 'Agendando…' : 'Agendar exame'}</Button><p className="mt-3 text-xs leading-relaxed text-muted-foreground">A disponibilidade é confirmada ao concluir o agendamento.</p>
        </aside>
      </div>
    </form>
  </div>;
}
