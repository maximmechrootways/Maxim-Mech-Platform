-- AlterTable
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "signatureMeta" JSONB;
