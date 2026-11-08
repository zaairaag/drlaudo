import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-2 px-6 pt-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('font-display text-lg leading-snug font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />;
}

export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('flex shrink-0 items-center gap-2 self-start', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex flex-wrap items-center gap-3 px-6 pb-6', className)} {...props} />;
}
