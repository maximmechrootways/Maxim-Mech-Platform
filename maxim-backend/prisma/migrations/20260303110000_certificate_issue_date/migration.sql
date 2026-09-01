-- AlterTable Certificate: optional issue date and index on holderUserId
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "issueDate" TEXT;
CREATE INDEX IF NOT EXISTS "Certificate_holderUserId_idx" ON "Certificate"("holderUserId");
