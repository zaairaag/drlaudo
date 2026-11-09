import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { AppointmentListQuerySchema, type StaffAppointment } from '@drlaudo/contract';
import { api, useCancelAppointmentMutation, useGetAppointmentsQuery, useGetPatientsQuery } from '../../app/api';
import { useAppStore } from '../../app/hooks';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { PageHeader } from '../../components/product/PageHeader';
import { StatusBadge } from '../../components/product/StatusBadge';
import { EmptyState } from '../../components/product/EmptyState';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { CancelDialog } from '../../components/product/CancelDialog';
import { formatDate, formatDateTime, formatLongDate, formatTime, shiftDate, todayDate } from '../../lib/time';
import { getErrorMessage } from '../../lib/errors';

function reportAction(appointment: StaffAppointment) {
  if (appointment.status === 'CANCELED') return 'Ver agendamento';
  if (!appointment.report) return 'Criar laudo';
  return appointment.report.status === 'DRAFT' ? 'Editar laudo' : 'Ver laudo';
}

export function AgendaPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const store = useAppStore();
  const navigationState: unknown = location.state;
  const createdAppointmentId = navigationState && typeof navigationState === 'object'
    && 'createdAppointmentId' in navigationState && typeof navigationState.createdAppointmentId === 'string'
    ? navigationState.createdAppointmentId : null;
  const focusId = params.getAll('focus').length === 1 ? params.get('focus') : null;
  const today = todayDate();
  const scope = params.get('scope');
  const allAppointments = scope === 'all';
  const selectedDate = params.get('date') ?? (params.has('scope') ? '' : today);
  const patientId = params.get('patientId') ?? '';
  const rawQuery = {
    ...(scope !== null ? { scope } : {}),
    ...(params.has('date') || !params.has('scope') ? { date: selectedDate } : {}),
    ...(patientId ? { patientId } : {}),
  };
  const parsed = AppointmentListQuerySchema.safeParse(rawQuery);
  const duplicate = ['date', 'patientId', 'scope'].some((key) => params.getAll(key).length > 1);
  const valid = parsed.success && !duplicate;
  const reportSearch = valid ? `?${new URLSearchParams(rawQuery)}` : '';
  const patients = useGetPatientsQuery();
  const patientName = patientId
    ? patients.currentData?.find((patient) => patient.id === patientId)?.name ?? 'Paciente selecionado (catálogo indisponível)'
    : 'Todos os pacientes';
  const agenda = useGetAppointmentsQuery(parsed.success ? parsed.data : {}, { skip: !valid });
  const [cancel, cancelState] = useCancelAppointmentMutation();
  const [feedback, setFeedback] = useState('');
  const [pendingCancellation, setPendingCancellation] = useState<StaffAppointment | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const cancellationBusy = cancelState.isLoading || reconciling || pendingCancellation !== null;
  const desktopAppointmentRef = useRef<HTMLTableRowElement>(null);
  const mobileAppointmentRef = useRef<HTMLElement>(null);
  const focusedLocation = useRef<string | null>(null);
  const appointments = agenda.currentData ?? [];
  const agendaReady = valid && agenda.isSuccess && !agenda.isFetching && !agenda.isError;
  const focusedAppointment = agendaReady ? appointments.find((item) => item.id === focusId) : undefined;
  const createdAppointment = focusedAppointment?.id === createdAppointmentId ? focusedAppointment : undefined;
  useEffect(() => {
    if (valid && !params.has('date') && !params.has('scope')) {
      setParams({ date: today, ...(patientId ? { patientId } : {}) }, { replace: true });
    }
  }, [params, valid, today, patientId, setParams]);
  useEffect(() => {
    if (!focusedAppointment || focusedLocation.current === location.key) return;
    const desktop = desktopAppointmentRef.current;
    const mobile = mobileAppointmentRef.current;
    const target = desktop && desktop.getClientRects().length > 0 ? desktop
      : mobile && mobile.getClientRects().length > 0 ? mobile : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    focusedLocation.current = location.key;
  }, [focusedAppointment, location.key]);
  function filters(date: string, patient = patientId) {
    setParams({ date, ...(patient ? { patientId: patient } : {}) });
    setFeedback('');
  }
  function showAllAppointments() {
    setParams({ scope: 'all', ...(patientId ? { patientId } : {}) });
    setFeedback('');
  }
  function filterPatient(patient: string) {
    const next = new URLSearchParams(params);
    next.delete('focus');
    if (patient) next.set('patientId', patient);
    else next.delete('patientId');
    setParams(next);
    setFeedback('');
  }
  async function reconcileCancellation(item: StaffAppointment, generation = store.getState().auth.generation) {
    setReconciling(true);
    const query = parsed.success ? parsed.data : {};
    try {
      // Do not mistake an in-flight pre-mutation response for reconciliation.
      await Promise.all([
        store.dispatch(api.util.getRunningQueryThunk('getAppointments', query)),
        store.dispatch(api.util.getRunningQueryThunk('getAppointment', item.id)),
        store.dispatch(api.util.getRunningQueryThunk('getSlots', { date: todayDate(new Date(item.startsAt)) })),
      ]);
      if (store.getState().auth.generation !== generation) return;
      const [list, detail, slots] = await Promise.allSettled([
        store.dispatch(api.endpoints.getAppointments.initiate(query, { subscribe: false, forceRefetch: true })).unwrap(),
        store.dispatch(api.endpoints.getAppointment.initiate(item.id, { subscribe: false, forceRefetch: true })).unwrap(),
        store.dispatch(api.endpoints.getSlots.initiate({ date: todayDate(new Date(item.startsAt)) }, { subscribe: false, forceRefetch: true })).unwrap(),
      ]);
      if (store.getState().auth.generation !== generation) return;
      if (list.status === 'rejected' || detail.status === 'rejected' || slots.status === 'rejected') {
        setFeedback('Não foi possível conferir o cancelamento. Confira novamente antes de cancelar outro agendamento.');
        return;
      }
      store.dispatch(api.util.updateQueryData('getAppointments', query, (items) => {
        const index = items.findIndex((entry) => entry.id === item.id);
        if (index >= 0) items[index] = detail.value;
      }));
      if (detail.value.status === 'CANCELED') {
        setFeedback('Agendamento cancelado.'); toast.success('Agendamento cancelado.');
      }
      setPendingCancellation(null);
    } finally {
      if (store.getState().auth.generation === generation) setReconciling(false);
    }
  }
  async function cancelAppointment(item: StaffAppointment) {
    if (cancellationBusy || !valid) return;
    setFeedback('');
    setPendingCancellation(item);
    const generation = store.getState().auth.generation;
    try {
      await cancel(item.id).unwrap();
    } catch (error) {
      if (store.getState().auth.generation !== generation) return;
      const message = getErrorMessage(error); setFeedback(message); toast.error(message);
    }
    if (store.getState().auth.generation === generation) await reconcileCancellation(item, generation);
  }
  const scheduled = appointments.filter((item) => item.status === 'SCHEDULED').length;
  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        title="Agenda de exames"
        description="Cada cuidado começa com uma boa organização."
        actions={<Button asChild><Link to={`/agendamentos/novo?${new URLSearchParams({ date: valid && !allAppointments ? selectedDate : today, ...(valid && patientId ? { patientId } : {}) })}`}><Plus className="size-4" aria-hidden />Novo agendamento</Link></Button>}
      />

      {createdAppointment && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-highlight/30 bg-highlight-soft px-5 py-4 text-sm sm:px-6">
          <p className="font-medium text-highlight-strong">Exame agendado.</p>
          <Button asChild variant="outline" size="sm"><Link to={`/agendamentos/${createdAppointment.id}/laudo${reportSearch}`}>Abrir agendamento</Link></Button>
        </div>
      )}

      <section className="min-w-0 rounded-xl border bg-card" aria-label="Agendamentos">
        <div className="grid items-end gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="agenda-date">Data</Label>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
              <Button variant="outline" size="icon" disabled={!valid || allAppointments || selectedDate === '0001-01-01'} aria-label="Dia anterior" onClick={() => filters(shiftDate(selectedDate, -1))}><ChevronLeft className="size-4" /></Button>
              <Input id="agenda-date" className="font-medium tabular-nums" type="date" min="0001-01-01" max="9999-12-31" value={selectedDate} onChange={(event) => filters(event.target.value)} />
              <Button variant="outline" size="icon" disabled={!valid || allAppointments || selectedDate === '9999-12-31'} aria-label="Próximo dia" onClick={() => filters(shiftDate(selectedDate, 1))}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="agenda-patient">Paciente</Label>
            <Select id="agenda-patient" value={patientId} onChange={(event) => filterPatient(event.target.value)} disabled={patients.isFetching || patients.isError || !patients.currentData} aria-describedby={patients.isError ? 'agenda-patients-error' : undefined}>
              <option value="">Todos os pacientes</option>
              {patientId && !patients.currentData?.some((patient) => patient.id === patientId) && <option value={patientId}>Paciente selecionado (catálogo indisponível)</option>}
              {patients.currentData?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
            </Select>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 md:col-span-2">
            <Button variant={valid && !allAppointments && selectedDate === today ? 'secondary' : 'ghost'} aria-pressed={valid && !allAppointments && selectedDate === today} onClick={() => filters(todayDate())}><CalendarDays className="size-4" aria-hidden />Hoje</Button>
            <Button variant={valid && allAppointments ? 'secondary' : 'outline'} className="min-w-0 shrink whitespace-normal" aria-pressed={valid && allAppointments} onClick={showAllAppointments}>Ver todos os agendamentos</Button>
          </div>
        </div>
        {patients.isError && (
          <Alert id="agenda-patients-error" variant="destructive" className="mx-5 mb-5 w-auto sm:mx-6">
            <AlertTitle>Não foi possível carregar os pacientes.</AlertTitle>
            <AlertDescription><Button variant="outline" className="mt-3" onClick={() => { void patients.refetch(); }}>Tentar carregar pacientes novamente</Button></AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 border-y bg-muted/30 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold leading-relaxed tracking-tight sm:text-xl">{valid ? allAppointments ? 'Todos os agendamentos' : <time dateTime={selectedDate}>{formatLongDate(selectedDate)}</time> : 'Agendamentos'}</h2>
              {valid && !allAppointments && selectedDate === today && <span className="rounded-full bg-highlight-soft px-2.5 py-1 text-xs font-semibold text-highlight-strong">Hoje</span>}
            </div>
            <TimezoneNote />
          </div>
          {valid && allAppointments && <p className="break-words text-sm text-muted-foreground">{patientName}</p>}
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Resumo da agenda">
            <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">Exames no período</dt><dd className="font-semibold tabular-nums">{agenda.isFetching ? '—' : appointments.length}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">Agendados</dt><dd className="font-semibold tabular-nums">{agenda.isFetching ? '—' : scheduled}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">Laudos publicados</dt><dd className="font-semibold tabular-nums">{agenda.isFetching ? '—' : appointments.filter((item) => item.report?.status === 'PUBLISHED').length}</dd></div>
          </dl>
        </div>

        {!valid ? (
          <div className="p-6 sm:p-8" role="alert">
            <p>Os filtros informados são inválidos.</p>
            <Button className="mt-4" variant="outline" onClick={() => filters(todayDate(), '')}>Limpar filtros</Button>
          </div>
        ) : agenda.isFetching && !pendingCancellation ? (
          <div className="p-5 sm:p-6" role="status" aria-live="polite">
            <span className="text-sm text-muted-foreground">Carregando agenda…</span>
            <div className="mt-5 divide-y" aria-hidden>
              {[1, 2, 3].map((key) => (
                <div key={key} className="flex items-center gap-5 py-5">
                  <div className="h-7 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : agenda.isError ? (
          <div className="p-6 sm:p-8" role="alert">
            <p>Não foi possível carregar a agenda.</p>
            <Button variant="outline" className="mt-4" onClick={() => { void agenda.refetch(); }}>Tentar novamente</Button>
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState title="Nenhum agendamento para os filtros selecionados." description="Experimente outra data ou agende um novo exame." action={<Button variant="outline" onClick={() => filters(todayDate(), '')}>Limpar filtros</Button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className={`${allAppointments ? 'w-36' : 'w-24'} px-6 py-4 font-medium`}>{allAppointments ? 'Data e horário' : 'Horário'}</th>
                    <th scope="col" className="px-4 py-4 font-medium">Paciente / exame</th>
                    <th scope="col" className="px-4 py-4 font-medium">Situação</th>
                    <th scope="col" className="px-4 py-4 font-medium">Laudo</th>
                    <th scope="col" className="px-6 py-4 font-medium"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointments.map((item) => (
                    <tr key={item.id} ref={item.id === focusId ? desktopAppointmentRef : undefined} data-appointment-id={item.id} tabIndex={-1} className={`scroll-mt-6 transition-colors hover:bg-muted/25 focus:outline-2 focus:outline-offset-[-2px] focus:outline-ring${createdAppointment?.id === item.id ? ' bg-highlight-soft/50' : ''}`}>
                      <td className="px-6 py-5 align-top">
                        <time dateTime={item.startsAt} className="font-semibold tabular-nums tracking-tight">
                          {allAppointments && <span className="mb-1 block whitespace-nowrap text-sm">{formatDate(item.startsAt)}</span>}
                          <span className="text-lg">{formatTime(item.startsAt)}</span>
                        </time>
                      </td>
                      <td className="px-4 py-5 align-top">
                        <strong className="block font-semibold leading-6">{item.patient.name}</strong>
                        <span className="mt-0.5 block leading-6 text-muted-foreground">{item.examType.name}</span>
                        {createdAppointment?.id === item.id && <span className="mt-2 inline-flex rounded-full border border-highlight/30 bg-highlight-soft px-2 py-0.5 text-xs font-semibold text-highlight-strong">Recém-agendado</span>}
                      </td>
                      <td className="px-4 py-5 align-top"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-5 align-top">{item.report ? <StatusBadge status={item.report.status} /> : <span className="inline-block py-1 text-muted-foreground">Sem laudo</span>}</td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="outline" size="sm"><Link className="whitespace-nowrap" to={`/agendamentos/${item.id}/laudo${reportSearch}`}><FileText className="size-4" aria-hidden />{reportAction(item)}</Link></Button>
                          {item.status === 'SCHEDULED' && item.report?.status !== 'PUBLISHED' && <CancelDialog appointment={item} pending={cancellationBusy} onConfirm={() => cancelAppointment(item)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y xl:hidden">
              {appointments.map((item) => (
                <article key={item.id} ref={item.id === focusId ? mobileAppointmentRef : undefined} data-appointment-id={item.id} tabIndex={-1} className={`scroll-mt-6 p-5 focus:outline-2 focus:outline-offset-[-2px] focus:outline-ring sm:p-6${createdAppointment?.id === item.id ? ' bg-highlight-soft/50' : ''}`}>
                  <div className={`grid gap-4 ${allAppointments ? 'grid-cols-[6.5rem_minmax(0,1fr)]' : 'grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)]'}`}>
                    <div>
                      <time dateTime={item.startsAt} className="font-semibold tabular-nums tracking-tight">
                        {allAppointments && <span className="mb-1 block text-sm">{formatDate(item.startsAt)}</span>}
                        <span className="text-xl sm:text-2xl">{formatTime(item.startsAt)}</span>
                      </time>
                      {!allAppointments && <span className="sr-only">{formatDateTime(item.startsAt)}</span>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold leading-6">{item.patient.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.examType.name}</p>
                      {createdAppointment?.id === item.id && <span className="mt-2 inline-flex rounded-full border border-highlight/30 bg-highlight-soft px-2 py-0.5 text-xs font-semibold text-highlight-strong">Recém-agendado</span>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        {item.report ? <StatusBadge status={item.report.status} /> : <span className="text-xs text-muted-foreground">Sem laudo</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                    <Button asChild variant="outline" size="sm"><Link to={`/agendamentos/${item.id}/laudo${reportSearch}`}><FileText className="size-4" aria-hidden />{reportAction(item)}</Link></Button>
                    {item.status === 'SCHEDULED' && item.report?.status !== 'PUBLISHED' && <CancelDialog appointment={item} pending={cancellationBusy} onConfirm={() => cancelAppointment(item)} />}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {feedback && <p role="status" aria-live="polite" className="text-sm">{feedback}</p>}
      {pendingCancellation && !reconciling && !cancelState.isLoading && (
        <Button variant="outline" onClick={() => void reconcileCancellation(pendingCancellation)}>Conferir cancelamento</Button>
      )}
    </div>
  );
}
