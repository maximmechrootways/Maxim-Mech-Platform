-- AlterTable
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "OutgoingInvoice" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "OutgoingInvoice" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncomingInvoice_reviewedAt_idx" ON "IncomingInvoice"("reviewedAt");
CREATE INDEX IF NOT EXISTS "IncomingInvoice_reviewedById_idx" ON "IncomingInvoice"("reviewedById");
CREATE INDEX IF NOT EXISTS "OutgoingInvoice_reviewedAt_idx" ON "OutgoingInvoice"("reviewedAt");
CREATE INDEX IF NOT EXISTS "OutgoingInvoice_reviewedById_idx" ON "OutgoingInvoice"("reviewedById");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OutgoingInvoice" ADD CONSTRAINT "OutgoingInvoice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
