-- Estimation & pricing project file storage (folders + optional site link).

CREATE TYPE "EstimationPricingFolder" AS ENUM (
  'TENDER_DRAWINGS',
  'TENDER_SPECS',
  'ADDENDUMS',
  'SUPPLIER_COSTS',
  'UNIT_PRICING_MATRIX',
  'FINAL_COST'
);

CREATE TABLE "EstimationProjectFile" (
  "id" TEXT NOT NULL,
  "folder" "EstimationPricingFolder" NOT NULL,
  "name" TEXT NOT NULL,
  "siteId" TEXT,
  "filePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EstimationProjectFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EstimationProjectFile_folder_idx" ON "EstimationProjectFile"("folder");
CREATE INDEX "EstimationProjectFile_siteId_idx" ON "EstimationProjectFile"("siteId");
CREATE INDEX "EstimationProjectFile_createdAt_idx" ON "EstimationProjectFile"("createdAt");

ALTER TABLE "EstimationProjectFile" ADD CONSTRAINT "EstimationProjectFile_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EstimationProjectFile" ADD CONSTRAINT "EstimationProjectFile_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
