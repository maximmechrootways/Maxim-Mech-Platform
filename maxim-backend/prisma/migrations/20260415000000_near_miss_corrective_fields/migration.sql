-- AlterTable
ALTER TABLE "NearMiss" ADD COLUMN "correctiveAction" TEXT;
ALTER TABLE "NearMiss" ADD COLUMN "correctiveActionDate" TIMESTAMP(3);
ALTER TABLE "NearMiss" ADD COLUMN "reportCompletedBy" TEXT;
