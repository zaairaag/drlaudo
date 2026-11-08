import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimezoneNoteProps = {
  className?: string;
};

export function TimezoneNote({ className }: TimezoneNoteProps) {
  return (
    <span data-slot="timezone-note" className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Globe aria-hidden="true" className="size-3.5 shrink-0" />
      <span>Horário de Brasília</span>
    </span>
  );
}
