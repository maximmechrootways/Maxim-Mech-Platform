-- AlterTable PdfSubmission: add title for HR filtering
ALTER TABLE "PdfSubmission" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- AlterTable PdfFormAssignment: add recurrence (once | daily | weekly | monthly)
ALTER TABLE "PdfFormAssignment" ADD COLUMN IF NOT EXISTS "recurrence" TEXT DEFAULT 'once';
