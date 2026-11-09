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
  headingLevel?: 1 | 2;
};

export function ReportViewer({ report, startsAt, examName, className, headingLevel = 1 }: ReportViewerProps) {
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const ContentHeading = headingLevel === 1 ? 'h2' : 'h3';
  const isPatientReport = !('status' in report);
  const resolvedExamName = examName ?? (isPatientReport ? report.examType?.name : undefined);
  const resolvedStartsAt = startsAt ?? (isPatientReport ? report.startsAt : undefined);
  const isDraft = !isPatientReport && report.status === 'DRAFT';

  return (
    <article
      data-slot="report-viewer"
      className={cn(
        'mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card sm:p-10 lg:p-12',
        className,
      )}
    >
      <header className="space-y-7 border-b border-border pb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <p className="text-sm font-medium text-highlight-strong">Laudo Diagnóstico</p>
            <Title className="font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-4xl">
              {report.title}
            </Title>
          </div>
          {!isPatientReport && (
            <StatusBadge status={report.status} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-lg bg-muted/60 p-5 text-sm sm:grid-cols-2">
          {resolvedExamName && (
            <div>
              <span className="block text-xs font-medium text-muted-foreground">Exame</span>
              <span className="font-semibold text-foreground">{resolvedExamName}</span>
            </div>
          )}

          {resolvedStartsAt && (
            <div>
              <span className="block text-xs font-medium text-muted-foreground">Data do exame</span>
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
            <div className="sm:col-span-2">
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

      <section className="min-h-48 py-8 sm:py-10">
        <ContentHeading className="sr-only">Conteúdo do laudo</ContentHeading>
        <div className="max-w-[65ch] whitespace-pre-wrap font-sans text-base leading-[1.85] text-foreground">
          {report.body}
        </div>
      </section>

      <footer className="border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        Projeto fictício para desafio técnico · dados de demonstração
      </footer>
    </article>
  );
}
