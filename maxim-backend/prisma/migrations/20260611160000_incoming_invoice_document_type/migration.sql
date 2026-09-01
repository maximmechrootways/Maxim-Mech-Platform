-- AlterTable
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "sourceSequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomingInvoice" ADD COLUMN IF NOT EXISTS "relatedInvoiceId" TEXT;

-- Drop old unique on gmailMessageId (one email may yield multiple documents)
DROP INDEX IF EXISTS "IncomingInvoice_gmailMessageId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IncomingInvoice_gmailMessageId_sourceSequence_key" ON "IncomingInvoice"("gmailMessageId", "sourceSequence");
CREATE INDEX IF NOT EXISTS "IncomingInvoice_documentType_idx" ON "IncomingInvoice"("documentType");
CREATE INDEX IF NOT EXISTS "IncomingInvoice_relatedInvoiceId_idx" ON "IncomingInvoice"("relatedInvoiceId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "IncomingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
