-- AlterTable
ALTER TABLE "User" ADD COLUMN "hireDate" TIMESTAMP(3);

-- Backfill from account creation so existing rows keep the same displayed hire date
UPDATE "User" SET "hireDate" = "createdAt" WHERE "hireDate" IS NULL;
