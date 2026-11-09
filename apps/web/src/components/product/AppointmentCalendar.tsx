import { createContext, useContext, useId, useMemo } from 'react';
import type { ComponentProps } from 'react';
import { CLINIC_TZ, type StaffAppointment } from '@drlaudo/contract';
import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format, getWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DayButton, type DayButtonProps } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import { formatLongDate, todayDate } from '../../lib/time';
import { cn } from '../../lib/utils';

interface DayCount {
  total: number;
  canceled: number;
}

interface CalendarContextValue {
  counts: ReadonlyMap<string, DayCount>;
  today: string;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);
const EMPTY_DAY: DayCount = { total: 0, canceled: 0 };

function clinicNoon(year: number, month: number, day: number, timeZone = CLINIC_TZ): TZDate {
  const date = new TZDate(2000, 0, 1, 12, 0, 0, 0, timeZone);
  date.setFullYear(year, month, day);
  return date;
}

function civilDate(value: string): TZDate {
  return clinicNoon(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
}

function copyCivilDay(date: Date, timeZone = CLINIC_TZ): TZDate {
  return clinicNoon(date.getFullYear(), date.getMonth(), date.getDate(), timeZone);
}

const FIRST_DAY = civilDate('0001-01-01');
const LAST_DAY = civilDate('9999-12-31');
const DATE_LIMITS = [{ before: FIRST_DAY }, { after: LAST_DAY }];

// Calendar boundaries stay at clinic noon, including historical DST/LMT offsets.
// DayPicker's built-in noonSafe reconstructs numeric years 0–99 as 1900–1999;
// setFullYear above preserves the complete civil-date contract instead.
const calendarDateLib = {
  newDate: (year, month, day) => clinicNoon(year, month, day),
  startOfDay: (date) => copyCivilDay(date),
  startOfMonth: (date) => clinicNoon(date.getFullYear(), date.getMonth(), 1),
  endOfMonth: (date) => clinicNoon(date.getFullYear(), date.getMonth() + 1, 0),
  startOfYear: (date) => clinicNoon(date.getFullYear(), 0, 1),
  endOfYear: (date) => clinicNoon(date.getFullYear(), 11, 31),
  startOfWeek: (date, options) => {
    const start = copyCivilDay(date);
    return addDays(start, -((start.getDay() - (options?.weekStartsOn ?? 0) + 7) % 7));
  },
  endOfWeek: (date, options) => {
    const end = copyCivilDay(date);
    return addDays(end, ((options?.weekStartsOn ?? 0) + 6 - end.getDay() + 7) % 7);
  },
  differenceInCalendarDays: (left, right) => differenceInCalendarDays(copyCivilDay(left, 'UTC'), copyCivilDay(right, 'UTC')),
  getWeek: (date, options) => getWeek(copyCivilDay(date, 'UTC'), { locale: ptBR, ...options }),
} satisfies NonNullable<ComponentProps<typeof Calendar>['dateLib']>;

const calendarClassNames = {
  months: 'relative flex w-full min-w-0 flex-col',
  month: 'flex w-full min-w-0 flex-col gap-2',
  month_caption: 'flex min-h-11 items-center justify-center px-12',
  caption_label: 'break-words text-center text-sm font-semibold capitalize leading-snug sm:text-base',
  month_grid: 'w-full table-fixed border-collapse',
  weekdays: 'grid grid-cols-7',
  weekday: 'flex h-8 min-w-0 items-center justify-center text-xs font-medium text-muted-foreground',
  week: 'grid w-full grid-cols-7 gap-0.5',
  day: 'relative min-w-0 p-0 text-center align-top',
  day_button: 'flex h-16 w-full min-w-0 flex-col items-center justify-between gap-0.5 rounded-md border border-border bg-card px-0.5 py-1 text-center text-sm leading-tight outline-none hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
  selected: '',
  today: '',
  disabled: 'pointer-events-none opacity-50',
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const calendarFormatters = {
  formatCaption: (date: Date) => format(date, "LLLL 'de' yyyy", { locale: ptBR }),
  formatWeekdayName: (date: Date) => weekdayLabels[date.getDay()] ?? '',
};

// A stable component identity lets DayPicker retain its roving focus on updates.
function AppointmentDayButton({ day, modifiers, children, className, ...props }: DayButtonProps) {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('AppointmentDayButton requires AppointmentCalendar.');
  const key = format(day.date, 'yyyy-MM-dd');
  const count = context.counts.get(key) ?? EMPTY_DAY;
  const temporalLabel = key === context.today ? 'Hoje' : '';
  const secondaryText = modifiers.selected ? 'text-primary-foreground/90' : 'text-muted-foreground';

  return (
    <DayButton
      {...props}
      day={day}
      modifiers={modifiers}
      aria-current={modifiers.today ? 'date' : undefined}
      className={cn(className,
        modifiers.today && 'border-primary',
        modifiers.selected && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
      )}
    >
      <span aria-hidden="true" className="flex h-full w-full min-w-0 flex-col items-center justify-between gap-0.5">
        <span className="font-semibold tabular-nums">{children}</span>
        {temporalLabel && <span className={cn('text-xs font-medium leading-3', secondaryText)}>{temporalLabel}</span>}
        {count.total > 0 && (
          <span className={cn('mt-auto text-xs font-semibold leading-4 tabular-nums', secondaryText)}>
            {count.total}<span className="hidden sm:inline"> {count.total === 1 ? 'exame' : 'exames'}</span>
          </span>
        )}
      </span>
    </DayButton>
  );
}

const calendarComponents = { DayButton: AppointmentDayButton };

export function AppointmentCalendar({ appointments, selectedDate, today, onDateChange }: {
  appointments: StaffAppointment[];
  selectedDate: string;
  today: string;
  onDateChange: (date: string) => void;
}) {
  const descriptionId = useId();
  const selected = useMemo(() => civilDate(selectedDate), [selectedDate]);
  const monthKey = selectedDate.slice(0, 7);
  const month = useMemo(() => civilDate(`${monthKey}-01`), [monthKey]);
  const clinicToday = useMemo(() => civilDate(today), [today]);
  const counts = useMemo(() => {
    const result = new Map<string, DayCount>();
    for (const appointment of appointments) {
      const key = todayDate(new Date(appointment.startsAt));
      const count = result.get(key);
      if (count) {
        count.total += 1;
        if (appointment.status === 'CANCELED') count.canceled += 1;
      } else {
        result.set(key, { total: 1, canceled: appointment.status === 'CANCELED' ? 1 : 0 });
      }
    }
    return result;
  }, [appointments]);
  const context = useMemo(() => ({ counts, today }), [counts, today]);
  const labels = useMemo(() => ({
    labelNext: () => 'Próximo mês',
    labelPrevious: () => 'Mês anterior',
    labelDayButton: (date: Date) => {
      const key = format(date, 'yyyy-MM-dd');
      const count = counts.get(key) ?? EMPTY_DAY;
      const total = `${count.total} ${count.total === 1 ? 'exame' : 'exames'}`;
      const canceled = count.canceled > 0 ? `, ${count.canceled} ${count.canceled === 1 ? 'cancelado' : 'cancelados'}` : '';
      const temporal = key === today ? ', Hoje' : key < today ? ', Data passada' : '';
      return `${formatLongDate(key)}, ${total}${canceled}${temporal}`;
    },
  }), [counts, today]);

  return (
    <div className="w-full min-w-0 py-3 sm:p-4">
      <p id={descriptionId} className="mb-2 px-1 text-xs leading-relaxed text-muted-foreground">Exames por dia, incluindo cancelados.<span className="sr-only"> Use as setas para explorar e Enter para selecionar o dia.</span></p>
      <CalendarContext.Provider value={context}>
        <Calendar
          mode="single"
          required
          month={month}
          selected={selected}
          today={clinicToday}
          timeZone={CLINIC_TZ}
          dateLib={calendarDateLib}
          startMonth={FIRST_DAY}
          endMonth={LAST_DAY}
          disabled={DATE_LIMITS}
          showOutsideDays={false}
          aria-label="Calendário mensal de exames"
          aria-describedby={descriptionId}
          className="w-full min-w-0 max-w-full p-0"
          classNames={calendarClassNames}
          components={calendarComponents}
          formatters={calendarFormatters}
          labels={labels}
          onMonthChange={(date) => {
            if (date.getFullYear() >= 1 && date.getFullYear() <= 9999) {
              onDateChange(`${format(date, 'yyyy-MM')}-01`);
            }
          }}
          onSelect={(date) => {
            if (date.getFullYear() >= 1 && date.getFullYear() <= 9999) {
              onDateChange(format(date, 'yyyy-MM-dd'));
            }
          }}
        />
      </CalendarContext.Provider>
    </div>
  );
}
