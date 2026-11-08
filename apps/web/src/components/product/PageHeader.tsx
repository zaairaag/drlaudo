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
    <header data-slot="page-header" className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 tabIndex={-1} className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl outline-none">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground sm:text-base">
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
