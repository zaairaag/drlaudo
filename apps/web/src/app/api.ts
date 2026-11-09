import {
  AppointmentListQuerySchema, CreateAppointmentRequestSchema, CreatePatientRequestSchema, CreateReportRequestSchema,
  ErrorResponseSchema, ExamTypeListResponseSchema, IdParamsSchema, LoginRequestSchema,
  LoginResponseSchema, MyAppointmentListResponseSchema, PatientListResponseSchema, PatientSchema,
  PublishedPatientReportSchema, SlotsResponseSchema, SlotQuerySchema,
  StaffAppointmentListResponseSchema, StaffAppointmentSchema, StaffReportSchema,
  UpdatePatientRequestSchema, UpdateReportRequestSchema, UserSchema,
  type AppointmentListQuery, type CreateAppointmentRequest, type CreatePatientRequest, type CreateReportRequest,
  type ErrorResponse, type ExamTypeListResponse, type LoginRequest, type LoginResponse,
  type MyAppointmentListResponse, type Patient, type PatientListResponse, type PublishedPatientReport,
  type SlotQuery, type SlotsResponse, type StaffAppointment, type StaffAppointmentListResponse,
  type StaffReport, type UpdatePatientRequest, type UpdateReportRequest,
} from '@drlaudo/contract';
import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { z } from 'zod';
import { resetSession, setNotice, type AuthState } from './authSlice';
import { SESSION_EXPIRED_NOTICE, sessionExpiresAt } from './sessionStorage';

export interface ApiClientError {
  status: number | 'FETCH_ERROR' | 'SESSION_CHANGED';
  data: ErrorResponse;
  retryAfter?: number;
}
interface ApiRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  input?: { schema: z.ZodType; value: unknown; location: 'body' | 'params' | 'query' };
  responseSchema: z.ZodType;
  expectedStatus?: 201;
  public?: boolean;
}
const internalError: ErrorResponse = {
  error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação.' },
};
const unauthorized: ErrorResponse = {
  error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária ou credenciais inválidas.' },
};
const errorStatuses = {
  VALIDATION_ERROR: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  SLOT_TAKEN: 409, EMAIL_TAKEN: 409, REPORT_EXISTS: 409, REPORT_LOCKED: 409, CANNOT_CANCEL: 409,
  APPOINTMENT_CANCELED: 409, PAST_DATE: 422, INVALID_SLOT: 422, RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

interface StoreState {
  auth: AuthState;
}
function getAuthState(state: unknown): AuthState {
  if (state && typeof state === 'object' && 'auth' in state) {
    return (state as StoreState).auth;
  }
  return { session: null, status: 'anonymous', notice: null, generation: 0 };
}

const validatedBaseQuery: BaseQueryFn<ApiRequest, unknown, ApiClientError> = async (request, context) => {
  const auth = getAuthState(context.getState());
  const generation = auth.generation;
  const session = auth.session;
  const current = () => getAuthState(context.getState()).generation === generation;
  if (!request.public && session) {
    const expiresAt = sessionExpiresAt(session);
    if (expiresAt === null || Date.now() >= expiresAt) {
      context.dispatch(resetSession({ notice: SESSION_EXPIRED_NOTICE }));
      return { error: { status: 401, data: unauthorized } };
    }
  }
  let body = request.body;
  if (request.input) {
    const parsed = request.input.schema.safeParse(request.input.value);
    if (!parsed.success) {
      return { error: { status: 400, data: {
        error: { code: 'VALIDATION_ERROR', message: 'Os dados informados são inválidos.', details: [{
          location: request.input.location, path: [], rule: 'INVALID_FORMAT', message: 'Formato de valor inválido.',
        }] },
      } } };
    }
    if (request.input.location === 'body') body = parsed.data;
  }
  const headers = new Headers({ Accept: 'application/json' });
  if (!request.public && session) headers.set('Authorization', `Bearer ${session.token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  try {
    const response = await fetch(`/api${request.url}`, {
      method: request.method ?? 'GET', headers, signal: context.signal, cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!current()) return { error: { status: 'SESSION_CHANGED', data: internalError } };
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { error: { status: 500, data: internalError } };
    }
    if (!current()) return { error: { status: 'SESSION_CHANGED', data: internalError } };
    if (!response.ok) {
      const error = ErrorResponseSchema.safeParse(data);
      if (!error.success || errorStatuses[error.data.error.code] !== response.status) {
        return { error: { status: 500, data: internalError } };
      }
      if (response.status === 401 && !request.public) context.dispatch(resetSession({ notice: SESSION_EXPIRED_NOTICE }));
      if (response.status === 403 && !request.public) context.dispatch(setNotice('Você não tem permissão para esta ação.'));
      const retryHeader = response.headers.get('Retry-After');
      const retryAfter = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : 0;
      return { error: {
        status: response.status, data: error.data,
        ...(Number.isSafeInteger(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
      } };
    }
    const parsed = request.responseSchema.safeParse(data);
    if (response.status !== (request.expectedStatus ?? 200) || !parsed.success) {
      return { error: { status: 500, data: internalError } };
    }
    return { data: parsed.data };
  } catch {
    return { error: { status: current() ? 'FETCH_ERROR' : 'SESSION_CHANGED', data: internalError } };
  }
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: validatedBaseQuery,
  tagTypes: ['Appointment', 'Slot', 'Report', 'MyAppointment', 'Patient'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  invalidationBehavior: 'immediately',
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body, public: true, input: { schema: LoginRequestSchema, value: body, location: 'body' }, responseSchema: LoginResponseSchema }),
    }),
    getMe: build.query<LoginResponse['user'], void>({
      query: () => ({ url: '/auth/me', responseSchema: UserSchema }),
    }),
    getPatients: build.query<PatientListResponse, void>({
      query: () => ({ url: '/patients', responseSchema: PatientListResponseSchema }),
      providesTags: ['Patient'],
    }),
    createPatient: build.mutation<Patient, CreatePatientRequest>({
      query: (body) => ({ url: '/patients', method: 'POST', body, input: { schema: CreatePatientRequestSchema, value: body, location: 'body' }, expectedStatus: 201, responseSchema: PatientSchema }),
      invalidatesTags: (_result, error) => error ? [] : ['Patient'],
    }),
    updatePatient: build.mutation<Patient, UpdatePatientRequest & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/patients/${encodeURIComponent(id)}`, method: 'PATCH', body, input: { schema: UpdatePatientRequestSchema, value: body, location: 'body' }, responseSchema: PatientSchema }),
      invalidatesTags: (_result, error) => error ? [] : ['Patient', 'Appointment'],
    }),
    getExamTypes: build.query<ExamTypeListResponse, void>({
      query: () => ({ url: '/exam-types', responseSchema: ExamTypeListResponseSchema }),
    }),
    getSlots: build.query<SlotsResponse, SlotQuery>({
      query: (query) => ({ url: `/slots?${new URLSearchParams(query).toString()}`, input: { schema: SlotQuerySchema, value: query, location: 'query' }, responseSchema: SlotsResponseSchema }),
      providesTags: ['Slot'],
    }),
    getAppointments: build.query<StaffAppointmentListResponse, AppointmentListQuery>({
      query: (query) => {
        const params = new URLSearchParams();
        if (query.date !== undefined) params.set('date', query.date);
        if (query.patientId !== undefined) params.set('patientId', query.patientId);
        return { url: `/appointments${params.size ? `?${params.toString()}` : ''}`, input: { schema: AppointmentListQuerySchema, value: query, location: 'query' }, responseSchema: StaffAppointmentListResponseSchema };
      },
      providesTags: (result) => [{ type: 'Appointment', id: 'LIST' }, ...(result ?? []).map(({ id }) => ({ type: 'Appointment' as const, id }))],
    }),
    getAppointment: build.query<StaffAppointment, string>({
      query: (id) => ({ url: `/appointments/${encodeURIComponent(id)}`, input: { schema: IdParamsSchema, value: { id }, location: 'params' }, responseSchema: StaffAppointmentSchema }),
      providesTags: (_result, _error, id) => [{ type: 'Appointment', id }],
    }),
    createAppointment: build.mutation<StaffAppointment, CreateAppointmentRequest>({
      query: (body) => ({ url: '/appointments', method: 'POST', body, input: { schema: CreateAppointmentRequestSchema, value: body, location: 'body' }, expectedStatus: 201, responseSchema: StaffAppointmentSchema }),
      invalidatesTags: ['Appointment', 'Slot'],
    }),
    cancelAppointment: build.mutation<StaffAppointment, string>({
      query: (id) => ({ url: `/appointments/${encodeURIComponent(id)}/cancel`, method: 'POST', input: { schema: IdParamsSchema, value: { id }, location: 'params' }, responseSchema: StaffAppointmentSchema }),
      invalidatesTags: ['Appointment', 'Slot'],
    }),
    getReport: build.query<StaffReport, string>({
      query: (appointmentId) => ({ url: `/appointments/${encodeURIComponent(appointmentId)}/report`, input: { schema: IdParamsSchema, value: { id: appointmentId }, location: 'params' }, responseSchema: StaffReportSchema }),
      providesTags: (result, _error, appointmentId) => [{ type: 'Report', id: `appointment:${appointmentId}` }, ...(result ? [{ type: 'Report' as const, id: result.id }] : [])],
    }),
    createReport: build.mutation<StaffReport, CreateReportRequest & { appointmentId: string }>({
      query: ({ appointmentId, ...body }) => ({ url: `/appointments/${encodeURIComponent(appointmentId)}/report`, method: 'POST', body, input: { schema: CreateReportRequestSchema, value: body, location: 'body' }, expectedStatus: 201, responseSchema: StaffReportSchema }),
      invalidatesTags: (result, error, { appointmentId }) => error ? [] : [{ type: 'Report', id: `appointment:${appointmentId}` }, { type: 'Appointment', id: result?.appointmentId ?? appointmentId }],
    }),
    updateReport: build.mutation<StaffReport, UpdateReportRequest & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/reports/${encodeURIComponent(id)}`, method: 'PATCH', body, input: { schema: UpdateReportRequestSchema, value: body, location: 'body' }, responseSchema: StaffReportSchema }),
      invalidatesTags: (result, error) => error || !result ? [] : [{ type: 'Report', id: result.id }, { type: 'Appointment', id: result.appointmentId }],
    }),
    publishReport: build.mutation<StaffReport, string>({
      query: (id) => ({ url: `/reports/${encodeURIComponent(id)}/publish`, method: 'POST', input: { schema: IdParamsSchema, value: { id }, location: 'params' }, responseSchema: StaffReportSchema }),
      invalidatesTags: (result, error) => error || !result ? [] : [{ type: 'Report', id: result.id }, { type: 'Appointment', id: result.appointmentId }, 'MyAppointment'],
    }),
    getMyAppointments: build.query<MyAppointmentListResponse, void>({
      query: () => ({ url: '/me/appointments', responseSchema: MyAppointmentListResponseSchema }),
      providesTags: ['MyAppointment'],
    }),
    getMyReport: build.query<PublishedPatientReport, string>({
      query: (id) => ({ url: `/me/appointments/${encodeURIComponent(id)}/report`, input: { schema: IdParamsSchema, value: { id }, location: 'params' }, responseSchema: PublishedPatientReportSchema }),
      providesTags: (_result, _error, id) => [{ type: 'Report', id: `appointment:${id}` }],
    }),
  }),
});
export const {
  useLoginMutation, useGetMeQuery, useGetPatientsQuery, useCreatePatientMutation, useUpdatePatientMutation, useGetExamTypesQuery, useGetSlotsQuery,
  useGetAppointmentsQuery, useGetAppointmentQuery, useCreateAppointmentMutation, useCancelAppointmentMutation,
  useGetReportQuery, useCreateReportMutation, useUpdateReportMutation, usePublishReportMutation,
  useGetMyAppointmentsQuery, useGetMyReportQuery,
} = api;
