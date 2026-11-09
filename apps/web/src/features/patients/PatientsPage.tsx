import { useState } from 'react';
import { Link } from 'react-router';
import { useGetPatientsQuery } from '../../app/api';
import { PageHeader } from '../../components/product/PageHeader';
import { EmptyState } from '../../components/product/EmptyState';
import { PatientDialog } from '../../components/product/PatientDialog';
import { PatientActivityDialog } from '../../components/product/PatientActivityDialog';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

export function PatientsPage() {
  const patients = useGetPatientsQuery();
  const [feedback, setFeedback] = useState('');
  const ready = patients.currentData !== undefined && !patients.isError;
  return (
    <div className="flex min-w-0 flex-col gap-7 sm:gap-8">
      <PageHeader title="Pacientes" description="Acesse os exames e mantenha os dados dos pacientes." actions={<PatientDialog disabled={!ready} onSaved={setFeedback} />} />
      {feedback && <p role="status" aria-live="polite" className="text-sm font-medium text-highlight-strong">{feedback}</p>}
      {patients.isError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os pacientes.</AlertTitle>
          <AlertDescription><Button variant="outline" className="mt-3" onClick={() => { void patients.refetch(); }}>Tentar novamente</Button></AlertDescription>
        </Alert>
      )}
      {!patients.currentData ? patients.isError ? null : (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Carregando pacientes…</p>
          {[1, 2, 3].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
        </div>
      ) : patients.currentData.length === 0 ? (
        <EmptyState title="Nenhum paciente cadastrado." description="Use Novo paciente para cadastrar o primeiro paciente." />
      ) : (
        <section aria-label="Pacientes cadastrados" aria-busy={patients.isFetching} className="min-w-0 rounded-xl border bg-card">
          <ul className="divide-y">
            {patients.currentData.map((patient) => (
              <li key={patient.id} data-patient-id={patient.id} className="flex min-w-0 flex-col items-start gap-4 p-5 xl:flex-row xl:items-center xl:justify-between sm:p-6">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words font-semibold leading-6">{patient.name}</h2>
                    <Badge variant={patient.active ? 'secondary' : 'outline'}>{patient.active ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                  <p className="mt-1 break-all text-sm leading-6 text-muted-foreground">{patient.email}</p>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <Button asChild><Link to={`/agenda?${new URLSearchParams({ scope: 'all', patientId: patient.id })}`}>Ver exames</Link></Button>
                  <div className="flex max-w-full flex-wrap gap-2">
                    <PatientDialog patient={patient} disabled={!ready} onSaved={setFeedback} />
                    <PatientActivityDialog patient={patient} disabled={!ready} onSaved={setFeedback} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">Os pacientes não são excluídos para preservar o histórico de exames e laudos.</p>
    </div>
  );
}
