-- Dr. Laudo initial schema.
-- The partial unique index is the only slot arbiter: SELECT before INSERT races.

CREATE TYPE "Role" AS ENUM ('STAFF', 'PATIENT');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CANCELED');
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "ExamType" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExamType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamType_code_key" ON "ExamType"("code");

CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "examTypeId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Appointment_startsAt_idx" ON "Appointment"("startsAt");
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "professionalName" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Report_appointmentId_key" ON "Report"("appointmentId");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_examTypeId_fkey"
  FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RN-09/RN-10: only an active SCHEDULED appointment occupies a slot.
CREATE UNIQUE INDEX "appointment_active_slot_unique"
  ON "Appointment" ("startsAt") WHERE "status" = 'SCHEDULED';

ALTER TABLE "Appointment" ADD CONSTRAINT "appointment_canceled_at_consistent"
  CHECK (("status" = 'SCHEDULED' AND "canceledAt" IS NULL)
      OR ("status" = 'CANCELED' AND "canceledAt" IS NOT NULL));

ALTER TABLE "Report" ADD CONSTRAINT "report_published_at_consistent"
  CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL)
      OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL));
