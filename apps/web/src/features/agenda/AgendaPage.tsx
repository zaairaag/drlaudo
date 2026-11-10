import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppointmentListQuerySchema, AppointmentStatusSchema, ReportStatusSchema, LocalDateSchema, type StaffAppointment } from '@drlaudo/contract';
import { api, useCancelAppointmentMutation, useGetAppointmentsQuery, useGetPatientsQuery } from '../../app/api';
import { appointmentCreationHref } from '../../app/navigation';
import { useAppStore } from '../../app/hooks';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { PageHeader } from '../../components/product/PageHeader';
import { EmptyState } from '../../components/product/EmptyState';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { AppointmentTimeline } from '../../components/product/AppointmentTimeline';
import { AppointmentCalendar } from '../../components/product/AppointmentCalendar';
import { AppointmentDayList } from '../../components/product/AppointmentDayList';
import { PatientDialog } from '../../components/product/PatientDialog';
import { formatLongDate, shiftDate, todayDate } from '../../lib/time';
import { getErrorMessage } from '../../lib/errors';

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
  const defaultCalendar = !params.has('date') && !params.has('scope') && !params.has('view') && !params.has('calendarDate');
  const scope = params.get('scope') ?? (defaultCalendar ? 'all' : null);
  const allAppointments = scope === 'all';
  const calendarMode = defaultCalendar || params.get('view') === 'calendar';
  const calendarDate = params.get('calendarDate') ?? today;
  const visualContextValid = !params.has('view') && !params.has('calendarDate')
    || allAppointments && calendarMode && (defaultCalendar || params.has('calendarDate')) && LocalDateSchema.safeParse(calendarDate).success;
  const selectedDate = params.get('date') ?? '';
  const patientId = params.get('patientId') ?? '';
  const appointmentStatus = params.get('appointmentStatus') ?? '';
  const reportStatus = params.get('reportStatus') ?? '';
  const extraFiltersValid = (!appointmentStatus || AppointmentStatusSchema.safeParse(appointmentStatus).success)
    && (!reportStatus || reportStatus === 'NONE' || ReportStatusSchema.safeParse(reportStatus).success);
  const extraFilters = {
    ...(appointmentStatus ? { appointmentStatus } : {}),
    ...(reportStatus ? { reportStatus } : {}),
  };
  const rawQuery = {
    ...(scope !== null ? { scope } : {}),
    ...(params.has('date') ? { date: selectedDate } : {}),
    ...(patientId ? { patientId } : {}),
  };
  const parsed = AppointmentListQuerySchema.safeParse(rawQuery);
  const duplicate = ['date', 'patientId', 'scope', 'view', 'calendarDate', 'appointmentStatus', 'reportStatus'].some((key) => params.getAll(key).length > 1);
  const valid = parsed.success && !duplicate && visualContextValid && extraFiltersValid;
  const activeDate = calendarMode ? calendarDate : selectedDate;
  const dateControlsDisabled = !valid;
  const dateForMode = valid && (!allAppointments || calendarMode) ? activeDate : today;
  const reportSearch = valid ? `?${new URLSearchParams({
    ...rawQuery,
    ...(calendarMode ? { view: 'calendar', calendarDate } : {}),
    ...extraFilters,
  })}` : '';
  const patients = useGetPatientsQuery();
  const selectedPatient = patients.isError ? undefined : patients.currentData?.find((patient) => patient.id === patientId);
  const patientName = patientId
    ? selectedPatient?.name ?? 'Paciente selecionado (catálogo indisponível)'
    : 'Todos os pacientes';
  const agenda = useGetAppointmentsQuery(parsed.success ? parsed.data : {}, { skip: !valid });
  const [cancel, cancelState] = useCancelAppointmentMutation();
  const [feedback, setFeedback] = useState('');
  const [pendingCancellation, setPendingCancellation] = useState<StaffAppointment | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const cancellationBusy = cancelState.isLoading || reconciling || pendingCancellation !== null;
  const desktopAppointmentRef = useRef<HTMLTableRowElement>(null);
  const mobileAppointmentRef = useRef<HTMLElement>(null);
  const calendarDayHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedLocation = useRef<string | null>(null);
  const appointments = (agenda.currentData ?? []).filter((item) =>
    (!appointmentStatus || item.status === appointmentStatus)
    && (!reportStatus || (reportStatus === 'NONE' ? item.report === null : item.report?.status === reportStatus)));
  const monthAppointments = calendarMode ? appointments.filter((item) => todayDate(new Date(item.startsAt)).startsWith(calendarDate.slice(0, 7))) : appointments;
  const dayAppointments = calendarMode ? monthAppointments.filter((item) => todayDate(new Date(item.startsAt)) === calendarDate) : appointments;
  const agendaReady = valid && agenda.isSuccess && !agenda.isFetching && !agenda.isError;
  const focusedAppointment = agendaReady ? appointments.find((item) => item.id === focusId) : undefined;
  const createdAppointment = focusedAppointment?.id === createdAppointmentId ? focusedAppointment : undefined;
  useEffect(() => {
    if (valid && defaultCalendar) {
      const next = new URLSearchParams(params);
      next.set('scope', 'all'); next.set('view', 'calendar'); next.set('calendarDate', today);
      setParams(next, { replace: true, preventScrollReset: true });
    }
  }, [defaultCalendar, valid, today, params, setParams]);
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
    setParams({ date, ...(patient ? { patientId: patient } : {}), ...(valid ? extraFilters : {}) });
    setFeedback('');
  }
  function showAllAppointments() {
    setParams({ scope: 'all', ...(patientId ? { patientId } : {}), ...extraFilters });
    setFeedback('');
  }
  function showCalendar(date: string) {
    setParams({ scope: 'all', ...(patientId ? { patientId } : {}), view: 'calendar', calendarDate: date, ...extraFilters }, { preventScrollReset: true });
    setFeedback('');
  }
  function selectDate(date: string) {
    if (calendarMode) showCalendar(date);
    else filters(date);
  }
  function clearSelection(keys: ('patientId' | 'appointmentStatus' | 'reportStatus')[]) {
    const next = new URLSearchParams(params);
    for (const key of keys) next.delete(key);
    next.delete('focus');
    setParams(next, { preventScrollReset: true });
    setFeedback('');
    const controls = { patientId: 'agenda-patient', appointmentStatus: 'agenda-status', reportStatus: 'agenda-report' };
    document.getElementById(keys.length === 1 && keys[0] ? controls[keys[0]] : 'agenda-patient')?.focus();
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
  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Agenda de exames"
        className="gap-3 pb-0 sm:items-center [&_h1]:text-2xl sm:[&_h1]:text-3xl"
        actions={<Button asChild><Link to={appointmentCreationHref(`/agenda${reportSearch}`)}><Plus className="size-4" aria-hidden />Novo agendamento</Link></Button>}
      />

      {createdAppointment && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-highlight/30 bg-highlight-soft px-5 py-4 text-sm sm:px-6">
          <p className="font-medium text-highlight-strong">Exame agendado.</p>
          <Button asChild variant="outline" size="sm"><Link to={`/agendamentos/${createdAppointment.id}/laudo${reportSearch}`}>Abrir agendamento</Link></Button>
        </div>
      )}

      <section className="min-w-0 rounded-xl border bg-card" aria-label="Agendamentos">
        <div className="flex min-w-0 flex-col gap-3 border-b px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
          <div role="group" aria-label="Visualização da agenda" className="flex w-full gap-1 sm:w-fit">
            <Button className="min-w-0 flex-1 whitespace-normal px-2 font-medium sm:flex-none sm:px-4" variant={valid && !allAppointments ? 'secondary' : 'ghost'} aria-pressed={valid && !allAppointments} onClick={() => filters(dateForMode)}>Dia</Button>
            <Button className="min-w-0 flex-1 whitespace-normal px-2 font-medium sm:flex-none sm:px-4" variant={valid && calendarMode ? 'secondary' : 'ghost'} aria-pressed={valid && calendarMode} onClick={() => showCalendar(dateForMode)}>Calendário</Button>
            <Button className="min-w-0 flex-1 whitespace-normal px-2 font-medium sm:flex-none sm:px-4" variant={valid && allAppointments && !calendarMode ? 'secondary' : 'ghost'} aria-pressed={valid && allAppointments && !calendarMode} onClick={showAllAppointments}>Linha do tempo</Button>
          </div>
          {valid && allAppointments && !calendarMode ? (
            <p className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden />Todos os períodos</p>
          ) : (
            <div className="min-w-0 sm:w-80">
              <Label htmlFor="agenda-date" className="sr-only">Data</Label>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-1">
                <Button variant="ghost" size="icon" disabled={dateControlsDisabled || activeDate === '0001-01-01'} aria-label="Dia anterior" onClick={() => selectDate(shiftDate(activeDate, -1))}><ChevronLeft className="size-4" aria-hidden /></Button>
                <Input id="agenda-date" className="h-11 min-w-0 border-border bg-background px-2 font-medium tabular-nums" type="date" min="0001-01-01" max="9999-12-31" value={activeDate} onChange={(event) => selectDate(event.target.value)} />
                <Button variant="ghost" size="icon" disabled={dateControlsDisabled || activeDate === '9999-12-31'} aria-label="Próximo dia" onClick={() => selectDate(shiftDate(activeDate, 1))}><ChevronRight className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="px-2 font-medium" onClick={() => selectDate(todayDate())}>Hoje</Button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3 bg-secondary/60 px-3 py-4 sm:px-5 [&_[data-slot=select]+svg]:right-3.5">
          <div className="grid grid-cols-1 items-end gap-3 min-[375px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
            <div className="min-w-0 space-y-2 min-[375px]:col-span-2 sm:col-span-1">
              <Label htmlFor="agenda-patient" className="text-xs font-medium text-muted-foreground">Paciente</Label>
              <Select id="agenda-patient" className="h-11 text-sm" value={patientId} onChange={(event) => filterPatient(event.target.value)} disabled={patients.isFetching || patients.isError || !patients.currentData} aria-describedby={patients.isError ? 'agenda-patients-error' : undefined}>
                <option value="">Todos os pacientes</option>
                {patientId && !patients.currentData?.some((patient) => patient.id === patientId) && <option value={patientId}>Paciente selecionado (catálogo indisponível)</option>}
                {patients.currentData?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}{!patient.active ? ' · Inativo' : ''}</option>)}
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="agenda-status" className="text-xs font-medium text-muted-foreground">Agendamento</Label>
              <Select id="agenda-status" className="h-11 text-sm" value={appointmentStatus} onChange={(event) => {
                const next = new URLSearchParams(params);
                next.delete('focus');
                if (event.target.value) next.set('appointmentStatus', event.target.value); else next.delete('appointmentStatus');
                setParams(next);
              }}>
                <option value="">Todos</option>
                <option value="SCHEDULED">Não cancelados</option>
                <option value="CANCELED">Cancelados</option>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="agenda-report" className="text-xs font-medium text-muted-foreground">Laudo</Label>
              <Select id="agenda-report" className="h-11 text-sm" value={reportStatus} onChange={(event) => {
                const next = new URLSearchParams(params);
                next.delete('focus');
                if (event.target.value) next.set('reportStatus', event.target.value); else next.delete('reportStatus');
                setParams(next);
              }}>
                <option value="">Todos</option>
                <option value="NONE">Sem laudo</option>
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicado</option>
              </Select>
            </div>
          </div>
          {valid && (patientId || appointmentStatus || reportStatus) && (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Filtros ativos" className="flex min-w-0 flex-wrap gap-1.5">
                {patientId && <Button variant="outline" className="max-w-full gap-2 px-2.5 text-xs font-medium" aria-label="Remover filtro de paciente" onClick={() => clearSelection(['patientId'])}><span className="truncate">{patientName}</span><X className="size-3.5" aria-hidden /></Button>}
                {appointmentStatus && <Button variant="outline" className="gap-2 px-2.5 text-xs font-medium" aria-label="Remover filtro de agendamento" onClick={() => clearSelection(['appointmentStatus'])}>{appointmentStatus === 'SCHEDULED' ? 'Não cancelados' : 'Cancelados'}<X className="size-3.5" aria-hidden /></Button>}
                {reportStatus && <Button variant="outline" className="gap-2 px-2.5 text-xs font-medium" aria-label="Remover filtro de laudo" onClick={() => clearSelection(['reportStatus'])}>{reportStatus === 'NONE' ? 'Sem laudo' : reportStatus === 'DRAFT' ? 'Rascunho' : 'Publicado'}<X className="size-3.5" aria-hidden /></Button>}
              </div>
              <Button variant="ghost" className="px-2 text-xs font-medium text-muted-foreground" onClick={() => clearSelection(['patientId', 'appointmentStatus', 'reportStatus'])}>Limpar seleção</Button>
            </div>
          )}
          {valid && patientId && (
            <section aria-label="Paciente selecionado" className="min-w-0 space-y-2 border-t pt-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <strong className="sr-only">{patientName}</strong>
                {selectedPatient && <Badge variant={selectedPatient.active ? 'secondary' : 'outline'}>{selectedPatient.active ? 'Ativo' : 'Inativo'}</Badge>}
                {selectedPatient && <PatientDialog key={selectedPatient.id} patient={selectedPatient} disabled={patients.isError} onSaved={setFeedback} />}
              </div>
              {selectedPatient?.active === false && <p className="text-xs leading-relaxed text-muted-foreground">Conta e novos agendamentos desativados. Histórico e edição de rascunhos continuam disponíveis.</p>}
            </section>
          )}
        </div>
        {patients.isError && (
          <Alert id="agenda-patients-error" variant="destructive" className="mx-5 mb-5 w-auto sm:mx-6">
            <AlertTitle>Não foi possível carregar os pacientes.</AlertTitle>
            <AlertDescription><Button variant="outline" className="mt-3" onClick={() => { void patients.refetch(); }}>Tentar carregar pacientes novamente</Button></AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y bg-muted/30 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold leading-relaxed tracking-tight">{valid ? calendarMode ? 'Calendário de exames' : allAppointments ? 'Todos os agendamentos' : <time dateTime={selectedDate}>{formatLongDate(selectedDate)}</time> : 'Agendamentos'}</h2>
            {valid && !allAppointments && selectedDate === today && <span className="rounded-full bg-highlight-soft px-2.5 py-1 text-xs font-semibold text-highlight-strong">Hoje</span>}
          </div>
          <TimezoneNote />
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
        ) : calendarMode ? (
          <div className="grid min-w-0 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-w-0">
              <div className="px-3 pt-3 xl:hidden">
                <Button asChild variant="outline" className="w-full">
                  <a href="#calendar-day-heading" onClick={(event) => {
                    event.preventDefault();
                    const heading = calendarDayHeadingRef.current;
                    heading?.focus({ preventScroll: true });
                    heading?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
                  }}>Ver exames do dia ({dayAppointments.length})</a>
                </Button>
              </div>
              <AppointmentCalendar appointments={appointments} selectedDate={calendarDate} today={today} onDateChange={showCalendar} />
            </div>
            <section aria-labelledby="calendar-day-heading" className="min-w-0 border-t xl:border-l xl:border-t-0">
              <h3 ref={calendarDayHeadingRef} id="calendar-day-heading" tabIndex={-1} className="scroll-mt-36 px-4 py-4 font-display text-base font-semibold outline-none focus:ring-2 focus:ring-inset focus:ring-ring sm:px-5 xl:scroll-mt-6" aria-live="polite">{formatLongDate(calendarDate)}</h3>
              {dayAppointments.length === 0 ? (
                <p className="px-4 pb-5 text-sm text-muted-foreground sm:px-5">Nenhum exame neste dia para os filtros selecionados.</p>
              ) : (
                <AppointmentDayList appointments={dayAppointments} today={today} reportSearch={reportSearch} focusId={focusId} desktopFocusRef={desktopAppointmentRef} mobileFocusRef={mobileAppointmentRef} createdAppointmentId={createdAppointment?.id} cancellationBusy={cancellationBusy} onCancel={cancelAppointment} compact />
              )}
            </section>
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState title="Nenhum agendamento para os filtros selecionados." description="Experimente outra data ou agende um novo exame." action={<Button variant="outline" onClick={() => filters(todayDate(), '')}>Limpar filtros</Button>} />
        ) : allAppointments ? (
          <AppointmentTimeline appointments={appointments} today={today} reportSearch={reportSearch} focusId={focusId} focusRef={mobileAppointmentRef} createdAppointmentId={createdAppointment?.id} cancellationBusy={cancellationBusy} onCancel={cancelAppointment} />
        ) : (
          <AppointmentDayList appointments={appointments} today={today} reportSearch={reportSearch} focusId={focusId} desktopFocusRef={desktopAppointmentRef} mobileFocusRef={mobileAppointmentRef} createdAppointmentId={createdAppointment?.id} cancellationBusy={cancellationBusy} onCancel={cancelAppointment} compact={false} />
        )}
      </section>
      {feedback && <p role="status" aria-live="polite" className="text-sm">{feedback}</p>}
      {pendingCancellation && !reconciling && !cancelState.isLoading && (
        <Button variant="outline" onClick={() => void reconcileCancellation(pendingCancellation)}>Conferir cancelamento</Button>
      )}
    </div>
  );
}
