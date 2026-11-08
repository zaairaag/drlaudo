import '@testing-library/jest-dom/vitest';
import type { PublishedPatientReport, StaffReport } from '@drlaudo/contract';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportViewer } from './ReportViewer';

afterEach(cleanup);

const report: PublishedPatientReport = {
  title: 'Raio-X de tórax',
  body: 'Primeira linha.\n\n<script>alert("não executar")</script>',
  professionalName: 'Dra. Marina Costa',
  publishedAt: '2026-11-09T01:30:00.000Z',
  startsAt: '2026-11-08T13:00:00.000Z',
  examType: { name: 'Raio-X de tórax' },
};

describe('S4/S5 · leitura segura de laudo', () => {
  it('mostra conteúdo literal, profissional e publicação em Brasília sem interpretar HTML', () => {
    const { container } = render(<ReportViewer report={report} />);
    expect(screen.getByRole('heading', { name: 'Raio-X de tórax' })).toBeVisible();
    expect(screen.getByText('Dra. Marina Costa')).toBeVisible();
    expect(screen.getByText('Publicado em')).toBeVisible();
    expect(screen.getByText('08/11/2026 às 22:30')).toBeVisible();
    expect(screen.getByText('Horário de Brasília')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert/)).toHaveTextContent('<script>alert("não executar")</script>');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('não fabrica data de publicação para rascunho da equipe', () => {
    const draft: StaffReport = {
      id: '40000000-0000-4000-8000-000000000002',
      appointmentId: '30000000-0000-4000-8000-000000000002',
      title: 'Avaliação abdominal',
      body: 'Rascunho preservado para revisão da equipe.',
      professionalName: 'Dra. Marina Costa',
      status: 'DRAFT',
      publishedAt: null,
      updatedAt: '2026-11-09T01:30:00.000Z',
    };
    render(<ReportViewer report={draft} startsAt="2026-11-08T13:00:00.000Z" examName="Ultrassonografia de abdome" />);
    expect(screen.getByText('Rascunho')).toBeVisible();
    expect(screen.queryByText('Publicado em')).not.toBeInTheDocument();
    expect(screen.getByText('Ultrassonografia de abdome')).toBeVisible();
  });
});
