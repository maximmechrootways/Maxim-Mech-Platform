-- AlterTable: add weather, hospital, emergency coordinator, job hazard, workplace violence fields
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "weatherTemp" TEXT;
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "weatherConditions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "nearestHospital" TEXT;
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "emergencyCoordinator" TEXT;
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "jobHazardAssessment" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "workplaceViolence" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DailyHazardSubmission" ADD COLUMN "workplaceViolenceActions" TEXT;
