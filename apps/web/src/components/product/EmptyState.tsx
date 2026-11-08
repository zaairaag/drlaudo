import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-card-foreground',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground mb-4">
        <Icon aria-hidden="true" className="size-6 shrink-0 text-brand-700" />
      </div>
      <h3 className="font-display text-base font-semibold text-foreground max-w-md">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
