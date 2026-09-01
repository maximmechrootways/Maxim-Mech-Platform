-- Add optional gate field to Job
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "gate" TEXT;

