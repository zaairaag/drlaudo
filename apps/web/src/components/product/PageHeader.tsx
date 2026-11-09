import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-col gap-6 pb-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-3">
        <h1 tabIndex={-1} className="font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-4xl outline-none">
          {title}
        </h1>
        {description && (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  );
}
