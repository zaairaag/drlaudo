import { useEffect, useState } from 'react';
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
  onSave: (values: CreateReportRequest) => Promise<void>;
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
  const isDirty = form.formState.isDirty;
  const errors = form.formState.errors;
  const disabled = isSaving || isPublishing || reconciling;

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
  }, [report, isDirty, form]);

  async function handleSubmit(values: CreateReportRequest) {
    if (disabled) return;
    await onSave(values);
    // Adota valores salvos como novo baseline
    setBaseline(values);
    form.reset(values);
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
    setReloadConfirmOpen(false);
  }

  const hasSavedDraft = report !== null && report.status === 'DRAFT';
  const canPublish = hasSavedDraft && !isDirty && !disabled;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
        className="space-y-6"
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
            {...form.register('title')}
            disabled={disabled}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'report-title-error' : undefined}
          />
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
            {...form.register('body')}
            disabled={disabled}
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? 'report-body-error' : undefined}
          />
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
            {...form.register('professionalName')}
            disabled={disabled}
            aria-invalid={!!errors.professionalName}
            aria-describedby={errors.professionalName ? 'report-professional-name-error' : undefined}
          />
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

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={disabled}>
              {isSaving ? 'Salvando…' : 'Salvar rascunho'}
            </Button>
            {hasSavedDraft && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={handleReload}
              >
                Recarregar rascunho
              </Button>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
            {isDirty && (
              <p className="text-sm text-warning" role="status">
                Salve o rascunho antes de publicar.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!canPublish}
              onClick={onPublishClick}
            >
              {isPublishing ? 'Publicando…' : 'Publicar'}
            </Button>
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
