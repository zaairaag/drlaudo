import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'SLOT_TAKEN',
  'REPORT_EXISTS', 'REPORT_LOCKED', 'CANNOT_CANCEL', 'APPOINTMENT_CANCELED',
  'PAST_DATE', 'INVALID_SLOT', 'RATE_LIMITED', 'INTERNAL_ERROR', 'EMAIL_TAKEN',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_MESSAGES = Object.freeze({
  VALIDATION_ERROR: 'Os dados informados são inválidos.',
  UNAUTHORIZED: 'Autenticação necessária ou credenciais inválidas.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos este registro',
  SLOT_TAKEN: 'Este horário acabou de ser ocupado.',
  EMAIL_TAKEN: 'Este e-mail já está cadastrado.',
  REPORT_EXISTS: 'Este agendamento já possui um laudo.',
  REPORT_LOCKED: 'Este laudo foi publicado e não pode ser alterado.',
  CANNOT_CANCEL: 'Este agendamento não pode ser cancelado.',
  APPOINTMENT_CANCELED: 'Não é possível criar, editar ou publicar laudo de um agendamento cancelado.',
  PAST_DATE: 'Escolha um horário que ainda não começou.',
  INVALID_SLOT: 'Escolha um horário da grade, entre 07:00 e 18:30.',
  RATE_LIMITED: 'Muitas tentativas de login. Tente novamente em instantes.',
  INTERNAL_ERROR: 'Não foi possível concluir a solicitação.',
} as const satisfies Record<ErrorCode, string>);

export const ValidationLocationSchema = z.enum(['params', 'query', 'body']);
export type ValidationLocation = z.infer<typeof ValidationLocationSchema>;

export const ValidationRuleSchema = z.enum([
  'REQUIRED', 'INVALID_TYPE', 'INVALID_FORMAT', 'TOO_SHORT', 'TOO_LONG',
  'UNKNOWN_FIELD', 'EMPTY_PATCH', 'UNEXPECTED_BODY', 'INVALID_JSON', 'DUPLICATE_QUERY',
]);
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;

export const VALIDATION_MESSAGES = Object.freeze({
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
} as const satisfies Record<ValidationRule, string>);

function validationIssue<Rule extends ValidationRule>(rule: Rule) {
  return z.strictObject({
    location: ValidationLocationSchema,
    path: z.array(z.string()),
    rule: z.literal(rule),
    message: z.literal(VALIDATION_MESSAGES[rule]),
  });
}

export const ValidationIssueSchema = z.discriminatedUnion('rule', [
  validationIssue('REQUIRED'), validationIssue('INVALID_TYPE'),
  validationIssue('INVALID_FORMAT'), validationIssue('TOO_SHORT'),
  validationIssue('TOO_LONG'), validationIssue('UNKNOWN_FIELD'),
  validationIssue('EMPTY_PATCH'), validationIssue('UNEXPECTED_BODY'),
  validationIssue('INVALID_JSON'), validationIssue('DUPLICATE_QUERY'),
]);
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// JavaScript's default string order compares UTF-16 units, not Unicode code points.
function compareCodePoints(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  for (;;) {
    const leftPoint = left.codePointAt(leftIndex);
    const rightPoint = right.codePointAt(rightIndex);
    if (leftPoint === undefined) return rightPoint === undefined ? 0 : -1;
    if (rightPoint === undefined) return 1;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
}

const locationOrder = { params: 0, query: 1, body: 2 } as const;

function compareIssues(left: ValidationIssue, right: ValidationIssue): number {
  const location = locationOrder[left.location] - locationOrder[right.location];
  if (location !== 0) return location;
  for (let index = 0; index < Math.min(left.path.length, right.path.length); index += 1) {
    const leftSegment = left.path[index];
    const rightSegment = right.path[index];
    if (leftSegment !== undefined && rightSegment !== undefined) {
      const segment = compareCodePoints(leftSegment, rightSegment);
      if (segment !== 0) return segment;
    }
  }
  return left.path.length - right.path.length || compareCodePoints(left.rule, right.rule);
}

const validationDetailsSchema = z.array(ValidationIssueSchema).min(1).check((context) => {
  if (context.issues.length > 0) return;
  for (let index = 1; index < context.value.length; index += 1) {
    const previous = context.value[index - 1];
    const current = context.value[index];
    if (previous !== undefined && current !== undefined && compareIssues(previous, current) >= 0) {
      context.issues.push({
        code: 'custom', input: context.value, path: [index],
        message: 'Os detalhes devem estar ordenados e sem duplicatas.',
      });
      return;
    }
  }
});

function standardError<Code extends Exclude<ErrorCode, 'VALIDATION_ERROR'>>(code: Code) {
  return z.strictObject({ code: z.literal(code), message: z.literal(ERROR_MESSAGES[code]) });
}

export const ErrorResponseSchema = z.strictObject({
  error: z.discriminatedUnion('code', [
    z.strictObject({
      code: z.literal('VALIDATION_ERROR'),
      message: z.literal(ERROR_MESSAGES.VALIDATION_ERROR),
      details: validationDetailsSchema,
    }),
    standardError('UNAUTHORIZED'), standardError('FORBIDDEN'), standardError('NOT_FOUND'),
    standardError('SLOT_TAKEN'), standardError('REPORT_EXISTS'), standardError('REPORT_LOCKED'),
    standardError('EMAIL_TAKEN'),
    standardError('CANNOT_CANCEL'), standardError('APPOINTMENT_CANCELED'),
    standardError('PAST_DATE'), standardError('INVALID_SLOT'), standardError('RATE_LIMITED'),
    standardError('INTERNAL_ERROR'),
  ]),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
