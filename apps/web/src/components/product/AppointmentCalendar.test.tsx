import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import type { StaffAppointment } from '@drlaudo/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appointment } from '../../app/testFixtures';
import { AppointmentCalendar } from './AppointmentCalendar';

afterEach(cleanup);

function exam(id: string, startsAt: string, status: StaffAppointment['status'] = 'SCHEDULED'): StaffAppointment {
  return { ...appointment, id, startsAt, status };
}

function renderCalendar(overrides: Partial<ComponentProps<typeof AppointmentCalendar>> = {}) {
  const props: ComponentProps<typeof AppointmentCalendar> = {
    appointments: [],
    selectedDate: '2026-11-10',
    today: '2026-11-10',
    onDateChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<AppointmentCalendar {...props} />), props };
}

describe('Calendário mensal da equipe', () => {
  it('expõe sete colunas e a contagem total, incluindo cancelados, sem repetir os detalhes dos exames', () => {
    renderCalendar({ appointments: [
      exam('scheduled-morning', '2026-11-10T13:00:00.000Z'),
      exam('scheduled-afternoon', '2026-11-10T17:00:00.000Z'),
      exam('canceled-evening', '2026-11-11T02:30:00.000Z', 'CANCELED'),
    ] });

    const grid = screen.getByRole('grid', { name: /novembro.*2026/i });
    const selected = within(grid).getByRole('button', { name: /10 de novembro de 2026.*3 exames.*1 cancelado/i });
    expect(within(grid).getByRole('gridcell', { selected: true })).toContainElement(selected);
    expect(screen.queryByText(appointment.patient.name)).not.toBeInTheDocument();
    expect(screen.queryByText(appointment.examType.name)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('agrupa instantes pela data de São Paulo na virada do mês, não pelo UTC nem pelo fuso do navegador', () => {
    const { rerender, props } = renderCalendar({
      selectedDate: '2026-11-30',
      appointments: [
        exam('november-morning', '2026-11-30T13:00:00.000Z'),
        exam('november-evening', '2026-12-01T02:59:59.000Z', 'CANCELED'),
        exam('december-midnight', '2026-12-01T03:00:00.000Z'),
      ],
    });
    expect(screen.getByRole('button', { name: /30 de novembro de 2026.*2 exames.*1 cancelado/i })).toBeEnabled();

    rerender(<AppointmentCalendar {...props} selectedDate="2026-12-01" />);
    expect(screen.getByRole('button', { name: /1 de dezembro de 2026.*1 exame/i })).toBeEnabled();
    expect(props.onDateChange).not.toHaveBeenCalled();
  });

  it('respeita o início histórico do horário de verão sem deslocar o dia selecionado', async () => {
    const user = userEvent.setup();
    const { props } = renderCalendar({
      selectedDate: '2018-11-03',
      appointments: [
        exam('before-dst', '2018-11-04T02:30:00.000Z'),
        exam('after-dst', '2018-11-04T03:00:00.000Z', 'CANCELED'),
      ],
    });
    expect(screen.getByRole('button', { name: /3 de novembro de 2018.*1 exame/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /4 de novembro de 2018.*1 exame.*1 cancelado/i }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2018-11-04');
  });

  it('mantém mês e seleção controlados por selectedDate, inclusive após uma atualização externa', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderCalendar();
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2026-12-01');
    expect(screen.getByRole('grid', { name: /novembro.*2026/i })).toBeVisible();

    rerender(<AppointmentCalendar {...props} selectedDate="2027-02-28" />);
    const grid = screen.getByRole('grid', { name: /fevereiro.*2027/i });
    const selected = within(grid).getByRole('button', { name: /28 de fevereiro de 2027.*0 exames/i });
    expect(within(grid).getByRole('gridcell', { selected: true })).toContainElement(selected);
    expect(props.onDateChange).toHaveBeenCalledTimes(1);
  });

  it('permite selecionar dias sem exames e devolve a data civil sem desvio de fuso', async () => {
    const user = userEvent.setup();
    const { props } = renderCalendar();
    const emptyDay = screen.getByRole('button', { name: /11 de novembro de 2026.*0 exames/i });
    expect(emptyDay).toBeEnabled();
    await user.click(emptyDay);
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2026-11-11');
  });

  it('não apaga a seleção ao acionar novamente o dia selecionado', async () => {
    const user = userEvent.setup();
    const { props } = renderCalendar();
    await user.click(screen.getByRole('button', { name: /10 de novembro de 2026.*0 exames/i }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2026-11-10');
  });

  it('preserva foco por setas e seleção por Enter nos botões enriquecidos com contagens', async () => {
    const user = userEvent.setup();
    const { props } = renderCalendar();
    screen.getByRole('button', { name: /10 de novembro de 2026.*0 exames/i }).focus();
    await user.keyboard('{ArrowRight}');
    const focusedDay = screen.getByRole('button', { name: /11 de novembro de 2026.*0 exames/i });
    expect(focusedDay).toHaveFocus();
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(screen.getByRole('button', { name: /10 de novembro de 2026.*0 exames/i }));
    expect(screen.getByRole('gridcell', { selected: true })).not.toContainElement(focusedDay);
    expect(props.onDateChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2026-11-11');
  });

  it('anuncia mudança de mês por PageDown com o primeiro dia civil do novo mês', async () => {
    const user = userEvent.setup();
    const { props } = renderCalendar();
    screen.getByRole('button', { name: /10 de novembro de 2026.*0 exames/i }).focus();
    await user.keyboard('{PageDown}');
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith('2026-12-01');
  });

  it.each([
    ['2026-01-31', 'Mês anterior', '2025-12-01'],
    ['2026-12-31', 'Próximo mês', '2027-01-01'],
    ['0099-12-31', 'Próximo mês', '0100-01-01'],
  ])('navega de %s por %s emitindo %s, sem carregar o dia 31 para o próximo mês', async (selectedDate, control, expectedDate) => {
    const user = userEvent.setup();
    const { props } = renderCalendar({ selectedDate });
    await user.click(screen.getByRole('button', { name: control }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith(expectedDate);
  });

  it.each([
    ['2024-02-01', /29 de fevereiro de 2024.*0 exames/i, '2024-02-29'],
    ['2000-02-01', /29 de fevereiro de 2000.*0 exames/i, '2000-02-29'],
    ['0100-02-01', /28 de fevereiro de 100.*0 exames/i, '0100-02-28'],
    ['0099-12-01', /31 de dezembro de 99.*0 exames/i, '0099-12-31'],
    ['0001-01-01', /, 1 de janeiro de 1,.*0 exames/i, '0001-01-01'],
    ['9999-12-01', /31 de dezembro de 9999.*0 exames/i, '9999-12-31'],
  ])('seleciona dias reais em %s preservando anos curtos e o intervalo 0001–9999', async (selectedDate, accessibleName, expectedDate) => {
    const user = userEvent.setup();
    const { props } = renderCalendar({ selectedDate });
    await user.click(screen.getByRole('button', { name: accessibleName }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith(expectedDate);
    if (selectedDate === '0100-02-01') {
      expect(screen.queryByRole('button', { name: /29 de fevereiro de 100/i })).not.toBeInTheDocument();
    }
  });

  it.each([
    ['0001-01-01', 'Mês anterior', 'Próximo mês', '0001-02-01'],
    ['9999-12-31', 'Próximo mês', 'Mês anterior', '9999-11-01'],
  ])('bloqueia navegação além de %s sem impedir a direção válida', async (selectedDate, blocked, enabled, expectedDate) => {
    const user = userEvent.setup();
    const { props } = renderCalendar({ selectedDate });
    const blockedControl = screen.getByRole('button', { name: blocked });
    expect(blockedControl).toHaveAttribute('aria-disabled', 'true');
    await user.click(blockedControl);
    expect(props.onDateChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: enabled }));
    expect(props.onDateChange).toHaveBeenCalledExactlyOnceWith(expectedDate);
  });

  it('identifica hoje e datas passadas nos nomes acessíveis sem confundir hoje com seleção', () => {
    renderCalendar({ selectedDate: '2026-11-09' });
    const today = screen.getByRole('button', { name: /10 de novembro de 2026.*0 exames.*hoje/i });
    const selected = screen.getByRole('button', { name: /, 9 de novembro de 2026,.*0 exames.*data passada/i });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(selected).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(selected);
  });

  it('atualiza contagens quando os exames filtrados mudam sem alterar a data por conta própria', () => {
    const { rerender, props } = renderCalendar({ appointments: [exam('scheduled', '2026-11-10T13:00:00.000Z')] });
    expect(screen.getByRole('button', { name: /10 de novembro de 2026.*1 exame/i })).toBeEnabled();
    rerender(<AppointmentCalendar {...props} appointments={[
      exam('scheduled', '2026-11-10T13:00:00.000Z'),
      exam('canceled', '2026-11-10T15:00:00.000Z', 'CANCELED'),
    ]} />);
    expect(screen.getByRole('button', { name: /10 de novembro de 2026.*2 exames.*1 cancelado/i })).toBeEnabled();
    expect(props.onDateChange).not.toHaveBeenCalled();
  });
});
