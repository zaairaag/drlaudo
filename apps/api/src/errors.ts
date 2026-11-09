import {
  ERROR_MESSAGES,
  type ErrorCode,
  type ValidationIssue,
} from '@drlaudo/contract';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLOT_TAKEN: 409,
  EMAIL_TAKEN: 409,
  REPORT_EXISTS: 409,
  REPORT_LOCKED: 409,
  CANNOT_CANCEL: 409,
  APPOINTMENT_CANCELED: 409,
  PAST_DATE: 422,
  INVALID_SLOT: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ValidationIssue[];

  constructor(code: ErrorCode, details?: ValidationIssue[], statusOverride?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
    this.status = statusOverride ?? STATUS_BY_CODE[code];
    if (details && details.length > 0) this.details = details;
  }
}

export function invalid(details: ValidationIssue[]): DomainError {
  return new DomainError('VALIDATION_ERROR', details);
}

export const notFound = () => new DomainError('NOT_FOUND');
export const unauthorized = () => new DomainError('UNAUTHORIZED');
export const forbidden = () => new DomainError('FORBIDDEN');

/** Only canonical envelopes leave the API; everything else becomes 500. */
export function toErrorBody(
  error: unknown,
  options: { health?: boolean } = {},
): { status: number; body: unknown } {
  if (error instanceof DomainError) {
    if (error.code === 'VALIDATION_ERROR') {
      return {
        status: error.status,
        body: {
          error: {
            code: error.code,
            message: ERROR_MESSAGES[error.code],
            details: error.details ?? [],
          },
        },
      };
    }
    return {
      status: error.status,
      body: { error: { code: error.code, message: ERROR_MESSAGES[error.code] } },
    };
  }
  return {
    status: options.health ? 503 : 500,
    body: { error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR } },
  };
}
