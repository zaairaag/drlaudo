import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertDialog } from 'radix-ui';
import {
  CreateReportRequestSchema,
  type CreateReportRequest,
  type StaffAppointment,
  type StaffReport,
} from '@drlaudo/contract';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

export interface ReportEditorProps {
  appointment: StaffAppointment;
  report: StaffReport | null;
  isSaving: boolean;
  isPublishing: boolean;
  reconciling: boolean;
  onSave: (values: CreateReportRequest, unsavedValues: CreateReportRequest) => Promise<boolean>;
  onPublishClick: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  initialValues?: CreateReportRequest | null;
}

export function ReportEditor({
  report,
  isSaving,
  isPublishing,
  reconciling,
  onSave,
  onPublishClick,
  onDirtyChange,
  initialValues,
}: ReportEditorProps) {
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const [actionLayout, setActionLayout] = useState({ docked: false, height: 0 });
  const [hasRestoredEdits, setHasRestoredEdits] = useState(Boolean(initialValues));
  const [baseline, setBaseline] = useState<CreateReportRequest>({
    title: report?.title ?? '',
    body: report?.body ?? '',
    professionalName: report?.professionalName ?? '',
  });

  const form = useForm<CreateReportRequest>({
    resolver: zodResolver(CreateReportRequestSchema),
    defaultValues: {
      title: initialValues?.title ?? report?.title ?? '',
      body: initialValues?.body ?? report?.body ?? '',
      professionalName: initialValues?.professionalName ?? report?.professionalName ?? '',
    },
    shouldFocusError: true,
  });
  const isDirty = form.formState.isDirty || hasRestoredEdits;
  const titleLength = form.watch('title').trim().length;
  const bodyLength = form.watch('body').trim().length;
  const professionalNameLength = form.watch('professionalName').trim().length;
  const errors = form.formState.errors;
  const disabled = isSaving || isPublishing || reconciling;
  const fieldScrollStyle = {
    scrollMarginBottom: actionLayout.docked ? actionLayout.height + 24 : 24,
  };

  useLayoutEffect(() => {
    const actionBar = actionBarRef.current;
    if (!actionBar) return;
    const viewport = window.visualViewport;

    function measureActions() {
      if (!actionBar) return;
      const height = actionBar.getBoundingClientRect().height;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      // Em zoom, teclado virtual ou pouca altura, as ações voltam ao fluxo sem sobreposição.
      const docked = viewportHeight >= 640 && height <= viewportHeight / 3;
      setActionLayout((current) => (
        current.docked === docked && current.height === height ? current : { docked, height }
      ));
    }

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureActions);
    observer?.observe(actionBar);
    window.addEventListener('resize', measureActions);
    viewport?.addEventListener('resize', measureActions);
    measureActions();

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureActions);
      viewport?.removeEventListener('resize', measureActions);
    };
  }, []);

  function revealField(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    event.currentTarget.scrollIntoView?.({ block: 'nearest' });
  }

  // Atualiza dirty no componente pai para proteção de rotas
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Se o laudo vindo da API mudar (e não houver edições dirty locais), adota como baseline
  useEffect(() => {
    if (!report) return;
    const nextBaseline: CreateReportRequest = {
      title: report.title,
      body: report.body,
      professionalName: report.professionalName,
    };
    if (!isDirty && !initialValues) {
      setBaseline(nextBaseline);
      form.reset(nextBaseline);
    }
  }, [report, isDirty, initialValues, form]);

  async function handleSubmit(values: CreateReportRequest) {
    if (disabled) return;
    const saved = await onSave(values, form.getValues());
    if (!saved) return;
    // Adota valores salvos como novo baseline
    setBaseline(values);
    form.reset(values);
    setHasRestoredEdits(false);
  }

  function handleReload() {
    if (isDirty) {
      setReloadConfirmOpen(true);
    } else {
      form.reset(baseline);
    }
  }

  function confirmReload() {
    const serverValues: CreateReportRequest = {
      title: report?.title ?? '',
      body: report?.body ?? '',
      professionalName: report?.professionalName ?? '',
    };
    setBaseline(serverValues);
    form.reset(serverValues);
    setHasRestoredEdits(false);
    setReloadConfirmOpen(false);
  }

  const hasSavedDraft = report !== null && report.status === 'DRAFT';
  const canPublish = hasSavedDraft && !isDirty && !disabled;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-8">
      <form
        onSubmit={(event) => {
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
        className="space-y-7"
        style={{ paddingBottom: actionLayout.docked ? actionLayout.height + 24 : undefined }}
      >
        {Object.keys(errors).length > 0 && (
          <p
            role="alert"
            className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive"
          >
            Confira os campos indicados antes de salvar.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="report-title">Título</Label>
          <Input
            id="report-title"
            className="scroll-mt-32 lg:scroll-mt-8"
            style={fieldScrollStyle}
            onFocus={revealField}
            {...form.register('title')}
            disabled={disabled}
            aria-invalid={!!errors.title}
            aria-describedby={`report-title-count${errors.title ? ' report-title-error' : ''}`}
          />
          <p id="report-title-count" className="text-right text-xs tabular-nums text-muted-foreground">
            {titleLength} / 120 caracteres
          </p>
          {errors.title && (
            <p id="report-title-error" role="alert" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-body">Texto do laudo</Label>
          <Textarea
            id="report-body"
            rows={10}
            className="min-h-72 scroll-mt-32 leading-relaxed sm:p-5 lg:scroll-mt-8"
            style={fieldScrollStyle}
            onFocus={revealField}
            {...form.register('body')}
            disabled={disabled}
            aria-invalid={!!errors.body}
            aria-describedby={`report-body-count${errors.body ? ' report-body-error' : ''}`}
          />
          <p id="report-body-count" className="text-right text-xs tabular-nums text-muted-foreground">
            {bodyLength} / 10.000 caracteres
          </p>
          {errors.body && (
            <p id="report-body-error" role="alert" className="text-sm text-destructive">
              {errors.body.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-professional-name">Profissional responsável</Label>
          <Input
            id="report-professional-name"
            className="scroll-mt-32 lg:scroll-mt-8"
            style={fieldScrollStyle}
            onFocus={revealField}
            {...form.register('professionalName')}
            disabled={disabled}
            aria-invalid={!!errors.professionalName}
            aria-describedby={`report-professional-name-count${errors.professionalName ? ' report-professional-name-error' : ''}`}
          />
          <p id="report-professional-name-count" className="text-right text-xs tabular-nums text-muted-foreground">
            {professionalNameLength} / 120 caracteres
          </p>
          {errors.professionalName && (
            <p
              id="report-professional-name-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.professionalName.message}
            </p>
          )}
        </div>

        <div
          ref={actionBarRef}
          role="group"
          aria-label="Ações do laudo"
          className={actionLayout.docked
            ? 'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card lg:left-60'
            : 'border-t border-border'}
        >
          <div
            className={actionLayout.docked
              ? 'mx-auto w-full max-w-7xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-10 xl:px-12'
              : 'pt-6'}
          >
            <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:justify-end">
              <Button type="submit" disabled={disabled} className="min-w-0 px-3 whitespace-normal">
                {isSaving ? 'Salvando…' : 'Salvar rascunho'}
              </Button>
              <Button
                id="report-publish-trigger"
                type="button"
                variant="outline"
                disabled={!canPublish}
                onClick={onPublishClick}
                aria-describedby={isDirty ? 'report-publish-hint' : undefined}
                className="min-w-0 px-3 whitespace-normal"
              >
                {isPublishing ? 'Publicando…' : 'Publicar'}
              </Button>

              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`min-w-0 space-y-1 text-sm sm:order-first sm:mr-auto sm:max-w-xs${hasSavedDraft ? '' : ' col-span-2'}`}
              >
                <p className={isDirty ? 'font-medium text-warning' : 'text-muted-foreground'}>
                  {isDirty
                    ? 'Alterações não salvas'
                    : hasSavedDraft ? 'Rascunho salvo no sistema' : 'Rascunho ainda não salvo'}
                </p>
                {isDirty && (
                  <p id="report-publish-hint" className="text-xs text-warning">
                    Salve o rascunho antes de publicar.
                  </p>
                )}
              </div>

              {hasSavedDraft && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={handleReload}
                  className="min-w-0 px-3 whitespace-normal"
                >
                  Recarregar rascunho
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Diálogo de confirmação para Recarregar rascunho descartando alterações */}
      <AlertDialog.Root open={reloadConfirmOpen} onOpenChange={setReloadConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl">
            <AlertDialog.Title className="font-display text-xl font-semibold">
              Descartar alterações?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Você tem alterações não salvas no laudo. Se recarregar, essas alterações serão perdidas.
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-3 pt-4">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Continuar editando</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="destructive" onClick={confirmReload}>
                  Descartar e recarregar
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
