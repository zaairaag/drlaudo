import type { Ref } from 'react';
import type { StaffAppointment } from '@drlaudo/contract';
import { Badge } from '../ui/badge';
import { AppointmentActions } from './AppointmentActions';
import { StatusBadge } from './StatusBadge';
import { formatDateTime, formatTime, todayDate } from '../../lib/time';

export function AppointmentDayList({ appointments, today, reportSearch, focusId, desktopFocusRef, mobileFocusRef, createdAppointmentId, cancellationBusy, onCancel, compact }: {
  appointments: StaffAppointment[];
  today: string;
  reportSearch: string;
  focusId: string | null;
  desktopFocusRef: Ref<HTMLTableRowElement>;
  mobileFocusRef: Ref<HTMLElement>;
  createdAppointmentId: string | undefined;
  cancellationBusy: boolean;
  onCancel: (appointment: StaffAppointment) => Promise<void>;
  compact: boolean;
}) {
  const ItemHeading = compact ? 'h4' : 'h3';
  return (
    <>
      {!compact && (
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="w-24 px-5 py-3 font-medium">Horário</th>
                <th scope="col" className="px-4 py-3 font-medium">Paciente / exame</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 font-medium">Laudo</th>
                <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appointments.map((item) => (
                <tr key={item.id} ref={item.id === focusId ? desktopFocusRef : undefined} data-appointment-id={item.id} tabIndex={-1} className={`scroll-mt-6 outline-none transition-colors hover:bg-muted/25 focus:ring-2 focus:ring-inset focus:ring-ring${createdAppointmentId === item.id ? ' bg-highlight-soft/50' : ''}`}>
                  <td className="px-5 py-4 align-top"><time dateTime={item.startsAt} className="text-lg font-semibold tabular-nums">{formatTime(item.startsAt)}</time></td>
                  <td className="px-4 py-4 align-top">
                    <strong className="block break-words font-semibold leading-6">{item.patient.name}</strong>
                    <span className="mt-0.5 block leading-6 text-muted-foreground">{item.examType.name}</span>
                    {createdAppointmentId === item.id && <Badge variant="secondary" className="mt-2">Recém-agendado</Badge>}
                  </td>
                  <td className="px-4 py-4 align-top"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-4 align-top">{item.report ? <StatusBadge status={item.report.status} /> : <span className="inline-block py-1 text-muted-foreground">Sem laudo</span>}</td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-center justify-end gap-1"><AppointmentActions appointment={item} reportSearch={reportSearch} pending={cancellationBusy} onCancel={() => onCancel(item)} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={`divide-y${compact ? '' : ' xl:hidden'}`}>
        {appointments.map((item) => {
          const date = compact ? todayDate(new Date(item.startsAt)) : '';
          const temporalLabel = date < today ? 'Data passada' : date === today ? 'Hoje' : 'Próximo exame';
          return (
            <article key={item.id} ref={item.id === focusId ? mobileFocusRef : undefined} data-appointment-id={item.id} aria-labelledby={`day-exam-${item.id}`} tabIndex={-1} className={`min-w-0 scroll-mt-6 p-4 outline-none focus:ring-2 focus:ring-inset focus:ring-ring sm:p-5${createdAppointmentId === item.id ? ' bg-highlight-soft/50' : ''}`}>
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                <div>
                  <time dateTime={item.startsAt} className="text-lg font-semibold tabular-nums">{formatTime(item.startsAt)}</time>
                  <span className="sr-only">{formatDateTime(item.startsAt)}</span>
                </div>
                <div className="min-w-0">
                  <ItemHeading id={`day-exam-${item.id}`} className="break-words font-semibold leading-6">{item.patient.name}</ItemHeading>
                  <p className="mt-0.5 break-words text-sm leading-6 text-muted-foreground">{item.examType.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.report ? <StatusBadge status={item.report.status} /> : <span className="text-xs text-muted-foreground">Sem laudo</span>}
                    {compact && <Badge variant={date === today ? 'secondary' : 'outline'}>{temporalLabel}</Badge>}
                    {createdAppointmentId === item.id && <Badge variant="secondary">Recém-agendado</Badge>}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <AppointmentActions appointment={item} reportSearch={reportSearch} pending={cancellationBusy} onCancel={() => onCancel(item)} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
