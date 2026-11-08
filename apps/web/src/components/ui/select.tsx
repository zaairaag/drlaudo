import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full min-w-0">
      <select
        data-slot="select"
        className={cn(
          'flex h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-card py-2 pr-10 pl-3 text-base text-foreground shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
