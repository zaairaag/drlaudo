import type { ErrorCode, ValidationIssue, ValidationLocation, ValidationRule } from '@drlaudo/contract';

export const ERROR_MESSAGES: Record<Exclude<ErrorCode, 'VALIDATION_ERROR'>, string> = {
  UNAUTHORIZED: 'Autenticação necessária ou credenciais inválidas.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos este registro',
  SLOT_TAKEN: 'Este horário acabou de ser ocupado.',
  REPORT_EXISTS: 'Este agendamento já possui um laudo.',
  REPORT_LOCKED: 'Este laudo foi publicado e não pode ser alterado.',
  CANNOT_CANCEL: 'Este agendamento não pode ser cancelado.',
  APPOINTMENT_CANCELED: 'Não é possível criar, editar ou publicar laudo de um agendamento cancelado.',
  PAST_DATE: 'Escolha um horário que ainda não começou.',
  INVALID_SLOT: 'Escolha um horário da grade, entre 07:00 e 18:30.',
  RATE_LIMITED: 'Muitas tentativas de login. Tente novamente em instantes.',
  INTERNAL_ERROR: 'Não foi possível concluir a solicitação.',
};

export const VALIDATION_MESSAGES: Record<ValidationRule, string> = {
  REQUIRED: 'Campo obrigatório.',
  INVALID_TYPE: 'Tipo de valor inválido.',
  INVALID_FORMAT: 'Formato de valor inválido.',
  TOO_SHORT: 'Valor menor que o limite permitido.',
  TOO_LONG: 'Valor maior que o limite permitido.',
  UNKNOWN_FIELD: 'Campo não permitido.',
  EMPTY_PATCH: 'Informe ao menos um campo.',
  UNEXPECTED_BODY: 'Não envie corpo nesta requisição.',
  INVALID_JSON: 'Envie JSON válido.',
  DUPLICATE_QUERY: 'Informe este parâmetro uma única vez.',
};

export const CANONICAL_NOT_FOUND_BODY = '{"error":{"code":"NOT_FOUND","message":"Não encontramos este registro"}}';

export function createIssue<Rule extends ValidationRule>(
  location: ValidationLocation,
  path: string[],
  rule: Rule,
): ValidationIssue {
  return { location, path, rule, message: VALIDATION_MESSAGES[rule] } as ValidationIssue;
}

function compareStringsByCodePoint(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

const LOCATION_ORDER: Record<ValidationLocation, number> = { params: 1, query: 2, body: 3 };

export function sortAndDeduplicateIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const sorted = [...issues].sort((a, b) => {
    if (a.location !== b.location) return LOCATION_ORDER[a.location] - LOCATION_ORDER[b.location];
    const maxLen = Math.max(a.path.length, b.path.length);
    for (let i = 0; i < maxLen; i += 1) {
      const segA = a.path[i];
      const segB = b.path[i];
      if (segA === undefined) return -1;
      if (segB === undefined) return 1;
      if (segA !== segB) return compareStringsByCodePoint(segA, segB);
    }
    return compareStringsByCodePoint(a.rule, b.rule);
  });

  const unique: ValidationIssue[] = [];
  for (const issue of sorted) {
    const isDuplicate = unique.some((existing) =>
      existing.location === issue.location &&
      existing.rule === issue.rule &&
      existing.path.length === issue.path.length &&
      existing.path.every((seg, idx) => seg === issue.path[idx]));
    if (!isDuplicate) unique.push(issue);
  }
  return unique;
}

export function jsonResponse(payload: unknown, status = 200, headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers });
}

export function errorResponse(
  code: Exclude<ErrorCode, 'VALIDATION_ERROR'>,
  status: number,
  headersInit?: HeadersInit,
): Response {
  return jsonResponse({ error: { code, message: ERROR_MESSAGES[code] } }, status, headersInit);
}

export function validationErrorResponse(issues: readonly ValidationIssue[]): Response {
  const details = sortAndDeduplicateIssues(issues);
  return jsonResponse({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Os dados informados são inválidos.',
      details,
    },
  }, 400);
}

export function notFoundResponse(): Response {
  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(CANONICAL_NOT_FOUND_BODY, { status: 404, headers });
}
