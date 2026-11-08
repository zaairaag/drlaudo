import type { Slot } from '@drlaudo/contract';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export type SlotGridProps = {
  slots: readonly Slot[] | Slot[];
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function SlotGrid({ slots, value = '', onChange, disabled = false, className }: SlotGridProps) {
  const hasAvailable = slots.some((slot) => slot.available);

  return (
    <div data-slot="slot-grid-container" className={cn('space-y-4', className)}>
      {!hasAvailable && (
        <div
          data-slot="no-slots-alert"
          role="status"
          className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          Não há horários disponíveis nesta data. Escolha outra data.
        </div>
      )}

      {slots.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <div
            data-slot="slot-grid"
            role="group"
            aria-label="Grade de horários"
            className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6"
          >
            {slots.map((slot, index) => {
              const time = formatTime(slot.startsAt);
              if (slot.available) {
                const isSelected = value === slot.startsAt;
                return (
                  <Button
                    key={slot.startsAt}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    aria-label={`${time}, disponível`}
                    onClick={() => onChange(slot.startsAt)}
                    className={cn(
                      'tabular-nums min-h-11 font-medium transition-all',
                      isSelected && 'shadow-sm ring-2 ring-primary ring-offset-2',
                    )}
                  >
                    {time}
                  </Button>
                );
              }

              const reasonLabel = slot.reason === 'PAST' ? 'horário passado' : 'ocupado';
              const reasonDescription = slot.reason === 'PAST' ? 'Horário passado' : 'Ocupado';
              const descriptionId = `slot-desc-${index}`;

              return (
                <Tooltip key={slot.startsAt}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex w-full">
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        aria-pressed="false"
                        aria-label={`${time}, ${reasonLabel}`}
                        aria-describedby={descriptionId}
                        className="tabular-nums min-h-11 w-full bg-muted/40 text-muted-foreground/60 border-dashed"
                      >
                        {time}
                      </Button>
                      <span id={descriptionId} className="sr-only">
                        {reasonDescription}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{reasonDescription}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
