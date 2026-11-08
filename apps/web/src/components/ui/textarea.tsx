import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-32 w-full min-w-0 resize-y rounded-lg border border-input bg-card px-3 py-3 text-base leading-relaxed text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
