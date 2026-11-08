import { Badge } from '@/components/ui/badge';
import { statusMap, type ProductStatus } from '@/features/status/statusMap';
import { cn } from '@/lib/utils';

export type StatusBadgeProps = {
  status: ProductStatus | string;
  patient?: boolean;
  className?: string;
};

export function StatusBadge({ status, patient = false, className }: StatusBadgeProps) {
  if (patient && status === 'DRAFT') {
    return null;
  }

  const effectiveKey: ProductStatus = patient && status === 'PUBLISHED' ? 'REPORT_AVAILABLE' : (status as ProductStatus);
  const definition = statusMap[effectiveKey] ?? {
    label: status,
    icon: null,
    className: 'bg-muted text-muted-foreground',
  };

  const Icon = definition.icon;

  return (
    <Badge
      data-slot="status-badge"
      variant="outline"
      className={cn('inline-flex items-center gap-1.5 border-transparent font-medium', definition.className, className)}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      <span>{definition.label}</span>
    </Badge>
  );
}
