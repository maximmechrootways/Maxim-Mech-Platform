-- AlterTable
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncomingInvoice_jobId_idx" ON "IncomingInvoice"("jobId");
CREATE INDEX IF NOT EXISTS "IncomingInvoice_paidAt_idx" ON "IncomingInvoice"("paidAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
