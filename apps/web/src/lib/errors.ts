import { ErrorResponseSchema, type ErrorCode } from '@drlaudo/contract';

const messages = {
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos este registro',
  SLOT_TAKEN: 'Este horário acabou de ser ocupado. Escolha outro.',
  PAST_DATE: 'Não é possível agendar em um horário que já passou.',
  INVALID_SLOT: 'Escolha um horário entre 07:00 e 18:30, de 30 em 30 minutos.',
  REPORT_EXISTS: 'Este agendamento já possui um laudo.',
  REPORT_LOCKED: 'Este laudo foi publicado e não pode ser alterado.',
  CANNOT_CANCEL: 'Este agendamento não pode mais ser cancelado.',
  APPOINTMENT_CANCELED: 'O agendamento foi cancelado; o laudo está bloqueado.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um minuto.',
  VALIDATION_ERROR: 'Confira os campos indicados e tente novamente.',
  INTERNAL_ERROR: 'Algo deu errado. Tente novamente em instantes.',
} as const satisfies Record<ErrorCode, string>;

export function getErrorMessage(error: unknown, context?: 'login' | 'session'): string {
  const candidate = typeof error === 'object' && error !== null && 'data' in error ? error.data : error;
  const result = ErrorResponseSchema.safeParse(candidate);
  if (!result.success) return messages.INTERNAL_ERROR;
  if (result.data.error.code === 'UNAUTHORIZED' && context === 'login') return 'E-mail ou senha incorretos.';
  return messages[result.data.error.code];
}
