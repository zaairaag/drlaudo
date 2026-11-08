import { useState } from 'react';
import type { Slot } from '@drlaudo/contract';
import { Logo } from '../../components/brand/Logo';
import { EmptyState } from '../../components/product/EmptyState';
import { PageHeader } from '../../components/product/PageHeader';
import { SlotGrid } from '../../components/product/SlotGrid';
import { StatusBadge } from '../../components/product/StatusBadge';
import { TimezoneNote } from '../../components/product/TimezoneNote';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useMockControls } from './MockControlsContext';

const DEMO_SLOTS: Slot[] = [
  { startsAt: '2026-11-10T10:00:00.000Z', available: false, reason: 'PAST' },
  { startsAt: '2026-11-10T10:30:00.000Z', available: false, reason: 'PAST' },
  { startsAt: '2026-11-10T11:00:00.000Z', available: true },
  { startsAt: '2026-11-10T11:30:00.000Z', available: false, reason: 'TAKEN' },
  { startsAt: '2026-11-10T12:00:00.000Z', available: true },
  { startsAt: '2026-11-10T12:30:00.000Z', available: true },
];

export function DesignSystemPage() {
  const [selectedSlot, setSelectedSlot] = useState<string>('2026-11-10T11:00:00.000Z');
  const mockControls = useMockControls();

  return (
    <div className="space-y-10 py-4">
      {/* Cabeçalho */}
      <PageHeader
        title="Catálogo do Design System"
        description="Apresentação de tokens semânticos, componentes de produto, tipografia e controles de desenvolvimento injetados."
        actions={<Logo variant="full" />}
      />

      {/* Controles de Mock injetados em desenvolvimento (sem importar mocks neste módulo) */}
      {mockControls && (
        <Card className="border-highlight/40 bg-highlight-soft/20 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base text-highlight-strong">Controles de Simulação (MSW)</CardTitle>
            <CardDescription className="text-xs">
              Injetados pelo bootstrap local em desenvolvimento. Este módulo não possui dependência de mocks.
            </CardDescription>
          </CardHeader>
          <CardContent>{mockControls}</CardContent>
        </Card>
      )}

      {/* Status Badges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Situações e Laudos (StatusBadge)</CardTitle>
          <CardDescription className="text-xs">
            Exibição com ícone e texto correspondente via statusMap.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-muted-foreground">Equipe — Agendado:</span>
            <StatusBadge status="SCHEDULED" />
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-muted-foreground">Equipe — Cancelado:</span>
            <StatusBadge status="CANCELED" />
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-muted-foreground">Equipe — Rascunho:</span>
            <StatusBadge status="DRAFT" />
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-muted-foreground">Equipe — Publicado:</span>
            <StatusBadge status="PUBLISHED" />
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-muted-foreground">Paciente — Disponível:</span>
            <StatusBadge status="PUBLISHED" patient />
          </div>
        </CardContent>
      </Card>

      {/* Grade de Horários */}
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-lg">Grade de Horários (SlotGrid)</CardTitle>
              <CardDescription className="text-xs">
                Exibe 24 inícios com botões acessíveis e distinção clara de estados.
              </CardDescription>
            </div>
            <TimezoneNote />
          </div>
        </CardHeader>
        <CardContent>
          <SlotGrid slots={DEMO_SLOTS} value={selectedSlot} onChange={setSelectedSlot} />
        </CardContent>
      </Card>

      {/* Botões */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Botões e Variantes</CardTitle>
          <CardDescription className="text-xs">Tokens semânticos e alvos táteis mínimos de 44 px.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="default">Padrão</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Desabilitado</Button>
        </CardContent>
      </Card>

      {/* Formulários e Alertas */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entradas de Formulário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="demo-input">Rótulo padrão</Label>
              <Input id="demo-input" placeholder="Exemplo de digitação…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-error">Entrada com erro</Label>
              <Input id="demo-error" aria-invalid="true" defaultValue="Valor inválido" />
              <p className="text-xs text-destructive">Formato incorreto.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alertas e Avisos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Informativo</AlertTitle>
              <AlertDescription>Dados de demonstração para desafio técnico.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Atenção</AlertTitle>
              <AlertDescription>Exemplo de mensagem crítica ou validação.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Estado Vazio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estado Vazio (EmptyState)</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Nenhum agendamento para os filtros selecionados."
            description="Tente alterar a data ou o paciente para visualizar outros horários."
            action={<Button variant="outline">Limpar filtros</Button>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
