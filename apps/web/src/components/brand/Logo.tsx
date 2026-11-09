import LogoMark from '@/assets/brand/logo-mark.svg?react';
import { cn } from '@/lib/utils';

type LogoProps = {
  variant?: 'full' | 'mark';
  tone?: 'color' | 'mono-light';
  className?: string;
};

export function Logo({ variant = 'full', tone = 'color', className }: LogoProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2.5 font-display', variant === 'full' ? 'min-w-24' : 'min-w-4', className)}>
      <LogoMark aria-hidden="true" focusable="false" className="size-9 min-w-4 shrink-0" />
      {variant === 'full' ? (
        <span className={cn('text-xl tracking-tight whitespace-nowrap', tone === 'mono-light' ? 'text-primary-foreground' : 'text-foreground')}>
          <span className="font-medium opacity-80">Dr.</span>{' '}<span className="font-bold">Laudo</span>
        </span>
      ) : <span className="sr-only">Dr. Laudo</span>}
    </span>
  );
}
