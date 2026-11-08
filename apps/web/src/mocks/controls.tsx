import React, { useSyncExternalStore } from 'react';
import type { MockDb } from './db.js';
import { mockRuntime } from './runtime.js';

export interface MockControlsProps {
  db?: MockDb;
}

export function MockControls({ db }: MockControlsProps): React.JSX.Element {
  const runtime = useSyncExternalStore(
    mockRuntime.subscribe,
    mockRuntime.getSnapshot,
    mockRuntime.getSnapshot,
  );

  return (
    <div
      className="p-4 border rounded-lg bg-card text-card-foreground text-sm shadow-xs"
      data-testid="mock-controls"
    >
      <div className="font-semibold mb-2">
        Controles de Simulação (MSW Dev Only)
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <button
          type="button"
          onClick={() => {
            if (db) {
              db.reset();
            }
          }}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-medium cursor-pointer text-xs"
          data-testid="mock-reset-btn"
        >
          Resetar Dados Demo
        </button>

        <button
          type="button"
          onClick={() => {
            mockRuntime.set({ error500: !runtime.error500 });
          }}
          className={`px-3 py-1.5 rounded-md font-medium cursor-pointer text-xs ${
            runtime.error500
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
          data-testid="mock-error500-btn"
        >
          {runtime.error500 ? 'Forçar 500: ATIVO' : 'Forçar Erro 500'}
        </button>

        <button
          type="button"
          onClick={() => {
            mockRuntime.set({ slow: !runtime.slow });
          }}
          className={`px-3 py-1.5 rounded-md font-medium cursor-pointer text-xs ${
            runtime.slow
              ? 'bg-accent text-accent-foreground font-semibold'
              : 'bg-muted text-muted-foreground'
          }`}
          data-testid="mock-slow-btn"
        >
          {runtime.slow ? 'Lentidão (1200ms): ATIVA' : 'Simular Lentidão'}
        </button>

        {db && (
          <span className="text-xs text-muted-foreground">
            Snapshot: {db.snapshotStatus} | Agendamentos: {db.appointments.length} | Laudos: {db.reports.length}
          </span>
        )}
      </div>
    </div>
  );
}
