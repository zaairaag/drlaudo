import {
  ErrorResponseSchema,
  MyAppointmentListResponseSchema,
  PublishedPatientReportSchema,
  StaffAppointmentListResponseSchema,
  StaffAppointmentSchema,
  StaffReportSchema,
  type CreateReportRequest,
  type ErrorCode,
} from '@drlaudo/contract';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export async function responseData<T>(
  response: APIResponse,
  status: number,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  expect(response.status(), `HTTP ${response.status()} em ${new URL(response.url()).pathname}`).toBe(status);
  const value: unknown = await response.json();
  return schema.parse(value);
}

export async function expectApiError(response: APIResponse, status: number, code: ErrorCode): Promise<void> {
  const result = await responseData(response, status, ErrorResponseSchema);
  expect(result.error.code).toBe(code);
}

export class ClinicApi {
  constructor(readonly request: APIRequestContext) {}

  async appointments(date: string, patientId?: string) {
    return responseData(await this.request.get('/appointments', {
      params: { date, ...(patientId ? { patientId } : {}) },
    }), 200, StaffAppointmentListResponseSchema);
  }

  async appointment(id: string) {
    return responseData(await this.request.get(`/appointments/${id}`), 200, StaffAppointmentSchema);
  }

  async createAppointment(patientId: string, examTypeId: string, startsAt: string) {
    return responseData(await this.request.post('/appointments', {
      data: { patientId, examTypeId, startsAt },
    }), 201, StaffAppointmentSchema);
  }

  async cancel(id: string) {
    return responseData(await this.request.post(`/appointments/${id}/cancel`), 200, StaffAppointmentSchema);
  }

  async createReport(appointmentId: string, values: CreateReportRequest) {
    return responseData(await this.request.post(`/appointments/${appointmentId}/report`, {
      data: values,
    }), 201, StaffReportSchema);
  }

  async report(appointmentId: string) {
    return responseData(await this.request.get(`/appointments/${appointmentId}/report`), 200, StaffReportSchema);
  }

  async publish(reportId: string) {
    return responseData(await this.request.post(`/reports/${reportId}/publish`), 200, StaffReportSchema);
  }

  async mine() {
    return responseData(await this.request.get('/me/appointments'), 200, MyAppointmentListResponseSchema);
  }

  async published(appointmentId: string) {
    return responseData(await this.request.get(`/me/appointments/${appointmentId}/report`), 200, PublishedPatientReportSchema);
  }
}
