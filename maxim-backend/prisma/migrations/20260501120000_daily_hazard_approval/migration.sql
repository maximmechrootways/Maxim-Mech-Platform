-- AlterTable: HR/Owner can approve Daily Hazard Analysis submissions
ALTER TABLE "DailyHazardSubmission" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyHazardSubmission" ADD COLUMN     "approvedAt" TIMESTAMP(3);
ALTER TABLE "DailyHazardSubmission" ADD COLUMN     "approvedById" TEXT;
ALTER TABLE "DailyHazardSubmission" ADD COLUMN     "approvedByName" TEXT;

CREATE INDEX "DailyHazardSubmission_approved_idx" ON "DailyHazardSubmission"("approved");
