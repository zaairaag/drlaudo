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
        'flex min-h-72 flex-col items-center justify-center rounded-xl bg-card p-8 text-center text-card-foreground',
        className,
      )}
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon aria-hidden="true" className="size-6 shrink-0 text-brand-700" />
      </div>
      <h3 className="max-w-md font-display text-xl font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
