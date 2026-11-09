export {
  CLINIC_TZ,
  SLOT_MINUTES,
  OPENING_HOUR,
  CLOSING_HOUR,
  DEFAULT_AGENDA_DAYS,
  JWT_ISSUER,
  SESSION_DURATION_SECONDS,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_SECONDS,
} from './constants.js';
export {
  RoleSchema,
  AppointmentStatusSchema,
  ReportStatusSchema,
  ExamTypeCodeSchema,
  SlotUnavailableReasonSchema,
} from './enums.js';
export type {
  Role,
  AppointmentStatus,
  ReportStatus,
  ExamTypeCode,
  SlotUnavailableReason,
} from './enums.js';

export {
  UUIDSchema,
  UtcDateTimeSchema,
  LocalDateSchema,
  EmailSchema,
  TokenSchema,
  EmptyObjectSchema,
  NoBodySchema,
  IdParamsSchema,
  UtcRangeSchema,
} from './schemas/common.js';
export type {
  UUID,
  UtcDateTime,
  LocalDate,
  Email,
  Token,
  EmptyObject,
  NoBody,
  IdParams,
  UtcRange,
} from './schemas/common.js';

export {
  UserSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  JwtClaimsSchema,
} from './schemas/auth.js';
export type { User, LoginRequest, LoginResponse, JwtClaims } from './schemas/auth.js';

export {
  ErrorCodeSchema,
  ValidationLocationSchema,
  ValidationRuleSchema,
  ValidationIssueSchema,
  ErrorResponseSchema,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from './errors.js';
export type {
  ErrorCode,
  ValidationLocation,
  ValidationRule,
  ValidationIssue,
  ErrorResponse,
} from './errors.js';

export {
  PatientSchema,
  PatientSummarySchema,
  PatientListResponseSchema,
  CreatePatientRequestSchema,
  UpdatePatientRequestSchema,
} from './schemas/patients.js';
export type {
  Patient,
  PatientSummary,
  PatientListResponse,
  CreatePatientRequest,
  UpdatePatientRequest,
} from './schemas/patients.js';

export {
  ExamTypeSchema,
  ExamTypeSummarySchema,
  ExamTypeNameSchema,
  ExamTypeListResponseSchema,
} from './schemas/exam-types.js';
export type {
  ExamType,
  ExamTypeSummary,
  ExamTypeName,
  ExamTypeListResponse,
} from './schemas/exam-types.js';

export { SlotSchema, SlotQuerySchema, SlotsResponseSchema } from './schemas/slots.js';
export type { Slot, SlotQuery, SlotsResponse } from './schemas/slots.js';
export {
  generateDaySlots,
  isValidSlot,
  isPast,
  localDayRange,
  defaultAgendaRange,
} from './slots.js';

export {
  ReportSummarySchema,
  StaffAppointmentSchema,
  CreateAppointmentRequestSchema,
  AppointmentListQuerySchema,
  StaffAppointmentListResponseSchema,
} from './schemas/appointments.js';
export type {
  ReportSummary,
  StaffAppointment,
  CreateAppointmentRequest,
  AppointmentListQuery,
  StaffAppointmentListResponse,
} from './schemas/appointments.js';

export {
  StaffReportSchema,
  CreateReportRequestSchema,
  UpdateReportRequestSchema,
} from './schemas/reports.js';
export type { StaffReport, CreateReportRequest, UpdateReportRequest } from './schemas/reports.js';

export {
  MyAppointmentSchema,
  MyAppointmentListResponseSchema,
  PublishedPatientReportSchema,
} from './schemas/me.js';
export type {
  MyAppointment,
  MyAppointmentListResponse,
  PublishedPatientReport,
} from './schemas/me.js';

export { HealthResponseSchema } from './schemas/health.js';
export type { HealthResponse } from './schemas/health.js';
