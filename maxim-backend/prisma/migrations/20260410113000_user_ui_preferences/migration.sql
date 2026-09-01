-- AlterTable
ALTER TABLE "User"
ADD COLUMN "uiPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb;
