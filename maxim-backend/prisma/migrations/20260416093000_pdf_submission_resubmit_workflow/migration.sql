-- Add resubmission workflow support for PDF submissions
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'RESUBMIT_REQUIRED';

ALTER TABLE "PdfSubmission"
ADD COLUMN IF NOT EXISTS "resubmissionReason" TEXT,
ADD COLUMN IF NOT EXISTS "resubmissionRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resubmissionRequestedById" TEXT,
ADD COLUMN IF NOT EXISTS "resubmittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resubmissionHistory" JSONB NOT NULL DEFAULT '[]';
