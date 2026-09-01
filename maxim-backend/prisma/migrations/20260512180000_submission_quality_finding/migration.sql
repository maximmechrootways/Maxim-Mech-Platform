-- Quality findings derived from PDF submissions (Phase 0: checklist substandard).

CREATE TYPE "QualityFindingSource" AS ENUM ('PDF_SUBMISSION');

CREATE TYPE "QualityFindingSeverity" AS ENUM ('warning', 'critical');

CREATE TABLE "SubmissionQualityFinding" (
    "id" TEXT NOT NULL,
    "sourceType" "QualityFindingSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "severity" "QualityFindingSeverity" NOT NULL DEFAULT 'warning',
    "templateId" TEXT,
    "templateNameSnapshot" TEXT,
    "fieldId" TEXT,
    "fieldLabelSnapshot" TEXT,
    "valueSnapshot" TEXT,
    "contextJson" JSONB,
    "linkedJobId" TEXT,
    "siteTextSnapshot" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "SubmissionQualityFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionQualityFinding_sourceType_sourceId_idx" ON "SubmissionQualityFinding"("sourceType", "sourceId");

CREATE INDEX "SubmissionQualityFinding_detectedAt_idx" ON "SubmissionQualityFinding"("detectedAt");

CREATE INDEX "SubmissionQualityFinding_templateId_idx" ON "SubmissionQualityFinding"("templateId");

CREATE INDEX "SubmissionQualityFinding_acknowledgedAt_idx" ON "SubmissionQualityFinding"("acknowledgedAt");
