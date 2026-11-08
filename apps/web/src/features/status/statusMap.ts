import type { AppointmentStatus, ReportStatus } from '@drlaudo/contract';
import { CalendarClock, CalendarX, FileCheck2, FilePen, type LucideIcon } from 'lucide-react';

export type ProductStatus = AppointmentStatus | ReportStatus | 'REPORT_AVAILABLE';

type StatusDefinition = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly className: string;
};

export const statusMap = {
  SCHEDULED: { label: 'Agendado', icon: CalendarClock, className: 'bg-secondary text-secondary-foreground' },
  CANCELED: { label: 'Cancelado', icon: CalendarX, className: 'bg-muted text-muted-foreground' },
  DRAFT: { label: 'Rascunho', icon: FilePen, className: 'bg-warning-soft text-warning' },
  PUBLISHED: { label: 'Publicado', icon: FileCheck2, className: 'bg-highlight-soft text-highlight-strong' },
  REPORT_AVAILABLE: { label: 'Laudo disponível', icon: FileCheck2, className: 'bg-highlight-soft text-highlight-strong' },
} as const satisfies Record<ProductStatus, StatusDefinition>;
