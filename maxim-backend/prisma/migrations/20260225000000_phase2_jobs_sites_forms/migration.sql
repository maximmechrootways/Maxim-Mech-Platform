-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSupervisor" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "JobSupervisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCheckIn" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),

    CONSTRAINT "JobCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contractStart" TEXT NOT NULL,
    "contractEnd" TEXT,
    "notes" TEXT,
    "insurancePolicyNumber" TEXT,
    "insuranceExpiry" TEXT,
    "orientationCompletedAt" TIMESTAMP(3),

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorJobAssignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorJobAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannedPdf" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannedPdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignableFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sourcePdfId" TEXT,
    "schedule" TEXT NOT NULL DEFAULT 'daily',
    "assignedToRoles" JSONB NOT NULL DEFAULT '[]',
    "assignedToUserIds" JSONB NOT NULL DEFAULT '[]',
    "placedFields" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SignableFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "siteId" TEXT,
    "siteName" TEXT,
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "workflowType" TEXT DEFAULT 'standard',
    "siteSignerIds" JSONB NOT NULL DEFAULT '[]',
    "siteSignatures" JSONB NOT NULL DEFAULT '[]',
    "auditEvents" JSONB NOT NULL DEFAULT '[]',
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "submittedToHrAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "lastOpenedBy" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedBy" TEXT,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignableFormSubmission" (
    "id" TEXT NOT NULL,
    "signableFormId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "dailyFormId" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "signatureText" TEXT,
    "signatureFilePath" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "geoAddress" TEXT,
    "workflowType" TEXT DEFAULT 'standard',
    "siteSignerIds" JSONB NOT NULL DEFAULT '[]',
    "siteSignatures" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SignableFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "requiredSigners" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "siteId" TEXT,
    "date" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'everyone',
    "visibleToRoles" JSONB NOT NULL DEFAULT '[]',
    "visibleToUserIds" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "acknowledgedBy" JSONB NOT NULL DEFAULT '[]',
    "lastOpenedAt" TIMESTAMP(3),
    "lastOpenedBy" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_siteId_idx" ON "Job"("siteId");

-- CreateIndex
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JobSupervisor_jobId_userId_key" ON "JobSupervisor"("jobId", "userId");

-- CreateIndex
CREATE INDEX "JobSupervisor_jobId_idx" ON "JobSupervisor"("jobId");

-- CreateIndex
CREATE INDEX "JobSupervisor_userId_idx" ON "JobSupervisor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAssignment_jobId_userId_key" ON "JobAssignment"("jobId", "userId");

-- CreateIndex
CREATE INDEX "JobAssignment_jobId_idx" ON "JobAssignment"("jobId");

-- CreateIndex
CREATE INDEX "JobAssignment_userId_idx" ON "JobAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCheckIn_jobId_userId_date_key" ON "JobCheckIn"("jobId", "userId", "date");

-- CreateIndex
CREATE INDEX "JobCheckIn_jobId_idx" ON "JobCheckIn"("jobId");

-- CreateIndex
CREATE INDEX "JobCheckIn_userId_idx" ON "JobCheckIn"("userId");

-- CreateIndex
CREATE INDEX "JobCheckIn_date_idx" ON "JobCheckIn"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorJobAssignment_jobId_subcontractorId_key" ON "SubcontractorJobAssignment"("jobId", "subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorJobAssignment_jobId_idx" ON "SubcontractorJobAssignment"("jobId");

-- CreateIndex
CREATE INDEX "SubcontractorJobAssignment_subcontractorId_idx" ON "SubcontractorJobAssignment"("subcontractorId");

-- CreateIndex
CREATE INDEX "ScannedPdf_uploadedById_idx" ON "ScannedPdf"("uploadedById");

-- CreateIndex
CREATE INDEX "SignableFormTemplate_sourcePdfId_idx" ON "SignableFormTemplate"("sourcePdfId");

-- CreateIndex
CREATE INDEX "SignableFormTemplate_createdById_idx" ON "SignableFormTemplate"("createdById");

-- CreateIndex
CREATE INDEX "FormSubmission_templateId_idx" ON "FormSubmission"("templateId");

-- CreateIndex
CREATE INDEX "FormSubmission_submittedById_idx" ON "FormSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");

-- CreateIndex
CREATE INDEX "SignableFormSubmission_signableFormId_idx" ON "SignableFormSubmission"("signableFormId");

-- CreateIndex
CREATE INDEX "SignableFormSubmission_submittedById_idx" ON "SignableFormSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "SignatureRequest_status_idx" ON "SignatureRequest"("status");

-- CreateIndex
CREATE INDEX "LibraryDocument_uploadedById_idx" ON "LibraryDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "LibraryDocument_siteId_idx" ON "LibraryDocument"("siteId");

-- CreateIndex
CREATE INDEX "LibraryDocument_visibility_idx" ON "LibraryDocument"("visibility");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSupervisor" ADD CONSTRAINT "JobSupervisor_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSupervisor" ADD CONSTRAINT "JobSupervisor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCheckIn" ADD CONSTRAINT "JobCheckIn_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCheckIn" ADD CONSTRAINT "JobCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorJobAssignment" ADD CONSTRAINT "SubcontractorJobAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorJobAssignment" ADD CONSTRAINT "SubcontractorJobAssignment_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannedPdf" ADD CONSTRAINT "ScannedPdf_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignableFormTemplate" ADD CONSTRAINT "SignableFormTemplate_sourcePdfId_fkey" FOREIGN KEY ("sourcePdfId") REFERENCES "ScannedPdf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignableFormTemplate" ADD CONSTRAINT "SignableFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignableFormSubmission" ADD CONSTRAINT "SignableFormSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignableFormSubmission" ADD CONSTRAINT "SignableFormSubmission_signableFormId_fkey" FOREIGN KEY ("signableFormId") REFERENCES "SignableFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
