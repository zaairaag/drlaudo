import type { PublishedPatientReport, StaffReport } from '@drlaudo/contract';
import { StatusBadge } from '@/components/product/StatusBadge';
import { TimezoneNote } from '@/components/product/TimezoneNote';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export type ReportViewerProps = {
  report: PublishedPatientReport | StaffReport;
  startsAt?: string;
  examName?: string;
  className?: string;
};

export function ReportViewer({ report, startsAt, examName, className }: ReportViewerProps) {
  const isPatientReport = !('status' in report);
  const resolvedExamName = examName ?? (isPatientReport ? report.examType?.name : undefined);
  const resolvedStartsAt = startsAt ?? (isPatientReport ? report.startsAt : undefined);
  const isDraft = !isPatientReport && report.status === 'DRAFT';

  return (
    <article
      data-slot="report-viewer"
      className={cn(
        'mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card sm:p-8 lg:p-10',
        className,
      )}
    >
      <header className="border-b border-border pb-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-highlight-strong">
              Laudo Diagnóstico
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {report.title}
            </h1>
          </div>
          {!isPatientReport && (
            <StatusBadge status={report.status} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 pt-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {resolvedExamName && (
            <div>
              <span className="block text-xs font-medium text-muted-foreground">Exame</span>
              <span className="font-semibold text-foreground">{resolvedExamName}</span>
            </div>
          )}

          {resolvedStartsAt && (
            <div>
              <span className="block text-xs font-medium text-muted-foreground">Realizado em</span>
              <span className="tabular-nums font-semibold text-foreground">
                {formatDateTime(resolvedStartsAt)}
              </span>
            </div>
          )}

          <div>
            <span className="block text-xs font-medium text-muted-foreground">Profissional responsável</span>
            <span className="font-semibold text-foreground">{report.professionalName}</span>
          </div>

          {!isDraft && report.publishedAt && (
            <div className="sm:col-span-2 lg:col-span-3">
              <span className="block text-xs font-medium text-muted-foreground">Publicado em</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums font-semibold text-foreground">
                  {formatDateTime(report.publishedAt)}
                </span>
                <TimezoneNote />
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="pt-6">
        <h2 className="sr-only">Conteúdo do laudo</h2>
        <div className="max-w-prose text-base leading-relaxed text-foreground whitespace-pre-wrap font-sans">
          {report.body}
        </div>
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Projeto fictício para desafio técnico · dados de demonstração
      </footer>
    </article>
  );
}
