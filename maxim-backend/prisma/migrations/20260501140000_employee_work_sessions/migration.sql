-- CreateTable
CREATE TABLE "EmployeeWorkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT,
    "jobId" TEXT,
    "subcontractorId" TEXT,
    "subcontractorPersonnelId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startNote" TEXT,
    "endNote" TEXT,
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "startAccuracyM" DOUBLE PRECISION,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "endAccuracyM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeWorkSession_userId_startedAt_idx" ON "EmployeeWorkSession"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "EmployeeWorkSession_siteId_idx" ON "EmployeeWorkSession"("siteId");

-- CreateIndex
CREATE INDEX "EmployeeWorkSession_jobId_idx" ON "EmployeeWorkSession"("jobId");

-- CreateIndex
CREATE INDEX "EmployeeWorkSession_endedAt_idx" ON "EmployeeWorkSession"("endedAt");

-- AddForeignKey
ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_subcontractorPersonnelId_fkey" FOREIGN KEY ("subcontractorPersonnelId") REFERENCES "SubcontractorPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
