import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { AppointmentListQuerySchema, type StaffAppointment } from '@drlaudo/contract';
import { useCancelAppointmentMutation, useGetAppointmentsQuery, useGetPatientsQuery } from '../../app/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { PageHeader } from '../../components/product/PageHeader';
import { StatusBadge } from '../../components/product/StatusBadge';
import { EmptyState } from '../../components/product/EmptyState';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { CancelDialog } from '../../components/product/CancelDialog';
import { formatDateTime, formatTime, shiftDate, todayDate } from '../../lib/time';
import { getErrorMessage } from '../../lib/errors';

function reportAction(appointment: StaffAppointment) {
  if (appointment.status === 'CANCELED') return 'Ver agendamento';
  if (!appointment.report) return 'Criar laudo';
  return appointment.report.status === 'DRAFT' ? 'Editar laudo' : 'Ver laudo';
}

export function AgendaPage() {
  const [params, setParams] = useSearchParams();
  const selectedDate = params.get('date') ?? todayDate();
  const patientId = params.get('patientId') ?? '';
  const rawQuery = { date: selectedDate, ...(patientId ? { patientId } : {}) };
  const parsed = AppointmentListQuerySchema.safeParse(rawQuery);
  const duplicate = params.getAll('date').length > 1 || params.getAll('patientId').length > 1;
  const valid = parsed.success && !duplicate;
  const patients = useGetPatientsQuery();
  const agenda = useGetAppointmentsQuery(parsed.success ? parsed.data : {}, { skip: !valid });
  const [cancel, cancelState] = useCancelAppointmentMutation();
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!params.has('date')) setParams(rawQuery, { replace: true });
  }, [params, selectedDate, patientId, setParams]);
  useEffect(() => {
    const focusId = params.get('focus');
    if (focusId && agenda.currentData) document.querySelector<HTMLElement>(`[data-appointment-id="${CSS.escape(focusId)}"]`)?.focus();
  }, [agenda.currentData, params]);
  function filters(date: string, patient = patientId) {
    setParams({ date, ...(patient ? { patientId: patient } : {}) });
    setFeedback('');
  }
  async function cancelAppointment(item: StaffAppointment) {
    setFeedback('');
    try {
      await cancel(item.id).unwrap();
      setFeedback('Agendamento cancelado.'); toast.success('Agendamento cancelado.');
    } catch (error) {
      const message = getErrorMessage(error); setFeedback(message); toast.error(message);
    } finally { await agenda.refetch(); }
  }
  const appointments = agenda.currentData ?? [];
  const scheduled = appointments.filter((item) => item.status === 'SCHEDULED').length;
  return <div className="space-y-6">
    <PageHeader title="Agenda de exames" description="Cada cuidado começa com uma boa organização." actions={<Button asChild><Link to={`/agendamentos/novo?date=${encodeURIComponent(valid ? selectedDate : todayDate())}`}><Plus className="size-4" aria-hidden />Novo agendamento</Link></Button>} />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo da agenda">
      <div className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">Exames no período</span><CalendarDays className="size-5" aria-hidden /></div><p className="mt-2 font-display text-3xl font-semibold tabular-nums">{agenda.isFetching ? '—' : appointments.length}</p></div>
      <div className="rounded-xl border bg-card p-5"><span className="text-sm text-muted-foreground">Agendados</span><p className="mt-2 font-display text-3xl font-semibold tabular-nums text-primary">{agenda.isFetching ? '—' : scheduled}</p></div>
      <div className="rounded-xl border bg-card p-5"><span className="text-sm text-muted-foreground">Laudos publicados</span><p className="mt-2 font-display text-3xl font-semibold tabular-nums text-highlight-strong">{agenda.isFetching ? '—' : appointments.filter((item) => item.report?.status === 'PUBLISHED').length}</p></div>
    </div>
    <section className="rounded-xl border bg-card" aria-label="Agendamentos">
      <div className="flex flex-wrap items-end gap-4 border-b p-5">
        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="agenda-date">Data</Label><div className="flex gap-2"><Button variant="outline" size="icon" disabled={!valid || selectedDate === '0001-01-01'} aria-label="Dia anterior" onClick={() => filters(shiftDate(selectedDate, -1))}><ChevronLeft className="size-4" /></Button><Input id="agenda-date" type="date" min="0001-01-01" max="9999-12-31" value={selectedDate} onChange={(event) => filters(event.target.value)} /><Button variant="outline" size="icon" disabled={!valid || selectedDate === '9999-12-31'} aria-label="Próximo dia" onClick={() => filters(shiftDate(selectedDate, 1))}><ChevronRight className="size-4" /></Button></div></div>
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="agenda-patient">Paciente</Label><Select id="agenda-patient" value={patientId} onChange={(event) => filters(selectedDate, event.target.value)} disabled={patients.isFetching}><option value="">Todos os pacientes</option>{patients.currentData?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</Select></div>
        <Button variant="outline" onClick={() => filters(todayDate(), '')}><SlidersHorizontal className="size-4" aria-hidden />Hoje</Button>
      </div>
      <div className="px-5 pt-4"><TimezoneNote /></div>
      {!valid ? <div className="p-6" role="alert"><p>Os filtros informados são inválidos.</p><Button className="mt-3" variant="outline" onClick={() => filters(todayDate(), '')}>Limpar filtros</Button></div>
        : agenda.isFetching ? <div className="space-y-4 p-6" role="status" aria-live="polite"><span className="text-sm text-muted-foreground">Carregando agenda…</span>{[1, 2, 3].map((key) => <div key={key} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>
        : agenda.isError ? <div className="p-6" role="alert"><p>Não foi possível carregar a agenda.</p><Button variant="outline" className="mt-3" onClick={() => { void agenda.refetch(); }}>Tentar novamente</Button></div>
        : appointments.length === 0 ? <EmptyState title="Nenhum agendamento para os filtros selecionados." description="Experimente outra data ou agende um novo exame." action={<Button variant="outline" onClick={() => filters(todayDate(), '')}>Limpar filtros</Button>} />
        : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-muted-foreground"><tr className="border-b"><th className="p-5 font-medium">Horário</th><th className="p-5 font-medium">Paciente / exame</th><th className="p-5 font-medium">Situação</th><th className="p-5 font-medium">Laudo</th><th className="p-5 font-medium"><span className="sr-only">Ações</span></th></tr></thead><tbody>{appointments.map((item) => <tr key={item.id} data-appointment-id={item.id} tabIndex={-1} className="border-b last:border-0 focus-visible:outline-2 focus-visible:outline-ring"><td className="p-5 font-medium tabular-nums">{formatTime(item.startsAt)}</td><td className="p-5"><strong className="font-medium">{item.patient.name}</strong><span className="mt-1 block text-muted-foreground">{item.examType.name}</span></td><td className="p-5"><StatusBadge status={item.status} /></td><td className="p-5">{item.report ? <StatusBadge status={item.report.status} /> : <span className="text-muted-foreground">Sem laudo</span>}</td><td className="p-5"><div className="flex justify-end gap-1"><Button asChild variant="outline" size="sm"><Link to={`/agendamentos/${item.id}/laudo`}><FileText className="size-4" aria-hidden />{reportAction(item)}</Link></Button>{item.status === 'SCHEDULED' && item.report?.status !== 'PUBLISHED' && <CancelDialog appointment={item} pending={cancelState.isLoading} onConfirm={() => cancelAppointment(item)} />}</div></td></tr>)}</tbody></table></div>
          <div className="divide-y md:hidden">{appointments.map((item) => <article key={item.id} data-appointment-id={item.id} tabIndex={-1} className="space-y-4 p-5 focus-visible:outline-2 focus-visible:outline-ring"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="tabular-nums">{formatTime(item.startsAt)}</strong><StatusBadge status={item.status} /></div><div><h2 className="font-display font-semibold">{item.patient.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.examType.name}</p><span className="sr-only">{formatDateTime(item.startsAt)}</span></div><div>{item.report ? <StatusBadge status={item.report.status} /> : <span className="text-sm text-muted-foreground">Sem laudo</span>}</div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to={`/agendamentos/${item.id}/laudo`}>{reportAction(item)}</Link></Button>{item.status === 'SCHEDULED' && item.report?.status !== 'PUBLISHED' && <CancelDialog appointment={item} pending={cancelState.isLoading} onConfirm={() => cancelAppointment(item)} />}</div></article>)}</div></>}
    </section>
    {feedback && <p role="status" aria-live="polite" className="text-sm">{feedback}</p>}
  </div>;
}
