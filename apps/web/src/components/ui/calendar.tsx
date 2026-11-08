import type { ComponentProps } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      data-slot="calendar"
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn('w-fit max-w-full rounded-lg bg-card p-2 text-card-foreground', className)}
      classNames={{
        root: defaults.root,
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex w-full flex-col gap-3',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'z-10'),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'z-10'),
        month_caption: 'flex h-11 items-center justify-center px-12',
        caption_label: 'text-sm font-semibold capitalize',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'flex h-9 w-11 items-center justify-center text-xs font-medium text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'relative size-11 p-0 text-center text-sm',
        day_button: 'inline-flex size-11 items-center justify-center rounded-lg font-normal outline-none hover:bg-accent focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
        selected: 'rounded-lg bg-primary text-primary-foreground [&>button]:hover:bg-primary',
        today: 'rounded-lg bg-secondary font-semibold text-secondary-foreground',
        outside: 'text-muted-foreground/60',
        disabled: 'pointer-events-none text-muted-foreground/40',
        hidden: 'invisible',
        range_start: 'rounded-l-lg bg-primary text-primary-foreground',
        range_end: 'rounded-r-lg bg-primary text-primary-foreground',
        range_middle: 'rounded-none bg-accent text-accent-foreground',
        ...classNames,
      }}
      labels={{ labelNext: () => 'Próximo mês', labelPrevious: () => 'Mês anterior' }}
      {...props}
    />
  );
}
