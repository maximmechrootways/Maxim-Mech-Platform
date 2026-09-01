-- Phase 1.3: Injury reports, root cause, subcontractor certifications, certificates (HR)

-- CreateTable: SubcontractorCertification
CREATE TABLE "SubcontractorCertification" (
    "id" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedAt" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'current',
    "fileName" TEXT,
    "filePath" TEXT,

    CONSTRAINT "SubcontractorCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InjuryReport
CREATE TABLE "InjuryReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "siteId" TEXT,
    "siteName" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "followUpNotes" TEXT,
    "injuredPersonName" TEXT,
    "injuredPersonId" TEXT,
    "injuryType" TEXT,
    "bodyPart" TEXT,
    "mechanism" TEXT,
    "dateOfInjury" TEXT,
    "lostTime" BOOLEAN NOT NULL DEFAULT false,
    "daysAwayFromWork" INTEGER,
    "restrictedDutyDays" INTEGER,
    "wsibReported" BOOLEAN NOT NULL DEFAULT false,
    "wsibClaimNumber" TEXT,
    "wsibReportedAt" TIMESTAMP(3),
    "subcontractorId" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "InjuryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RootCauseAnalysis
CREATE TABLE "RootCauseAnalysis" (
    "id" TEXT NOT NULL,
    "linkedType" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "immediateCause" TEXT NOT NULL,
    "contributingCauses" JSONB NOT NULL DEFAULT '[]',
    "underlyingCause" TEXT,
    "analyzedById" TEXT NOT NULL,
    "analyzedBy" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RootCauseAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Certificate (HR certificates with expiry)
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderUserId" TEXT,
    "expirationDate" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT,
    "filePath" TEXT,
    "expirationReminderSentAt" TIMESTAMP(3),

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "SubcontractorCertification_subcontractorId_idx" ON "SubcontractorCertification"("subcontractorId");
CREATE INDEX "SubcontractorCertification_expiresAt_idx" ON "SubcontractorCertification"("expiresAt");
CREATE INDEX "InjuryReport_reportedById_idx" ON "InjuryReport"("reportedById");
CREATE INDEX "InjuryReport_status_idx" ON "InjuryReport"("status");
CREATE INDEX "InjuryReport_jobId_idx" ON "InjuryReport"("jobId");
CREATE INDEX "InjuryReport_subcontractorId_idx" ON "InjuryReport"("subcontractorId");
CREATE INDEX "InjuryReport_reportedAt_idx" ON "InjuryReport"("reportedAt");
CREATE UNIQUE INDEX "RootCauseAnalysis_linkedType_linkedId_key" ON "RootCauseAnalysis"("linkedType", "linkedId");
CREATE INDEX "RootCauseAnalysis_linkedType_linkedId_idx" ON "RootCauseAnalysis"("linkedType", "linkedId");
CREATE INDEX "Certificate_uploadedById_idx" ON "Certificate"("uploadedById");
CREATE INDEX "Certificate_expirationDate_idx" ON "Certificate"("expirationDate");

-- FKs
ALTER TABLE "SubcontractorCertification" ADD CONSTRAINT "SubcontractorCertification_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
