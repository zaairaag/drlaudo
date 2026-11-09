import type { Ref } from 'react';
import type { StaffAppointment } from '@drlaudo/contract';
import { Badge } from '../ui/badge';
import { AppointmentActions } from './AppointmentActions';
import { StatusBadge } from './StatusBadge';
import { formatDateTime, formatMonth, todayDate } from '../../lib/time';

export function AppointmentTimeline({ appointments, today, reportSearch, focusId, focusRef, createdAppointmentId, cancellationBusy, onCancel }: {
  appointments: StaffAppointment[];
  today: string;
  reportSearch: string;
  focusId: string | null;
  focusRef: Ref<HTMLElement>;
  createdAppointmentId: string | undefined;
  cancellationBusy: boolean;
  onCancel: (appointment: StaffAppointment) => Promise<void>;
}) {
  const months = new Map<string, StaffAppointment[]>();
  for (const item of appointments.toSorted((left, right) => left.startsAt.localeCompare(right.startsAt))) {
    const month = formatMonth(item.startsAt);
    const group = months.get(month);
    if (group) group.push(item);
    else months.set(month, [item]);
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 p-5 sm:p-6" aria-label="Linha do tempo dos exames">
      {[...months].map(([month, items], index) => (
        <section key={month} aria-labelledby={`agenda-month-${index}`} className="min-w-0">
          <h3 id={`agenda-month-${index}`} className="mb-5 font-display text-lg font-semibold">{month}</h3>
          <ol className="ml-1 border-l">
            {items.map((item) => {
              const date = todayDate(new Date(item.startsAt));
              const temporalLabel = date < today ? 'Data passada' : date === today ? 'Hoje' : 'Próximo exame';
              return (
                <li key={item.id} className="relative min-w-0 pl-5 sm:pl-7">
                  <span aria-hidden className="absolute -left-1.5 top-6 size-3 rounded-full border-2 border-card bg-muted-foreground" />
                  <article
                    ref={item.id === focusId ? focusRef : undefined}
                    data-appointment-id={item.id}
                    aria-labelledby={`timeline-exam-${item.id}`}
                    tabIndex={-1}
                    className={`min-w-0 scroll-mt-6 border-b py-5 focus:outline-2 focus:outline-offset-4 focus:outline-ring${item.id === createdAppointmentId ? ' bg-highlight-soft/50' : ''}`}
                  >
                    <div className="grid min-w-0 gap-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6">
                      <div className="flex min-w-0 flex-col items-start gap-2">
                        <span className="text-xs text-muted-foreground">Data do exame</span>
                        <time dateTime={item.startsAt} className="text-sm font-semibold leading-6 tabular-nums">{formatDateTime(item.startsAt)}</time>
                        <Badge variant={date === today ? 'secondary' : 'outline'}>{temporalLabel}</Badge>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-sm text-muted-foreground">{item.patient.name}</p>
                        <h4 id={`timeline-exam-${item.id}`} className="font-semibold leading-6">{item.examType.name}</h4>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusBadge status={item.status} />
                          {item.report ? <StatusBadge status={item.report.status} /> : <span className="text-xs text-muted-foreground">Sem laudo</span>}
                          {item.id === createdAppointmentId && <Badge variant="secondary">Recém-agendado</Badge>}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <AppointmentActions appointment={item} reportSearch={reportSearch} pending={cancellationBusy} onCancel={() => onCancel(item)} />
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
