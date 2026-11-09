import { Link } from 'react-router';
import { FileText } from 'lucide-react';
import type { StaffAppointment } from '@drlaudo/contract';
import { Button } from '../ui/button';
import { CancelDialog } from './CancelDialog';

export function AppointmentActions({ appointment, reportSearch, pending, onCancel }: {
  appointment: StaffAppointment;
  reportSearch: string;
  pending: boolean;
  onCancel: () => Promise<void>;
}) {
  const action = appointment.status === 'CANCELED' ? 'Ver agendamento'
    : !appointment.report ? 'Criar laudo'
      : appointment.report.status === 'DRAFT' ? 'Editar laudo' : 'Ver laudo';
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link to={`/agendamentos/${appointment.id}/laudo${reportSearch}`}><FileText aria-hidden />{action}</Link>
      </Button>
      {appointment.status === 'SCHEDULED' && appointment.report?.status !== 'PUBLISHED' && (
        <CancelDialog appointment={appointment} pending={pending} onConfirm={onCancel} />
      )}
    </>
  );
}
