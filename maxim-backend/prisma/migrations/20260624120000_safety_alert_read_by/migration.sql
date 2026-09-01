-- AlterTable
ALTER TABLE "SafetyAlert" ADD COLUMN "readBy" JSONB NOT NULL DEFAULT '[]';
