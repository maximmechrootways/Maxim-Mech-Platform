-- CreateTable
CREATE TABLE "HazardRiskAssessmentSubmission" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "jobId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardRiskAssessmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardReviewComment" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL DEFAULT 'general_labourer',
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "hrRemark" TEXT,
    "hrRemarkById" TEXT,
    "hrRemarkAt" TIMESTAMP(3),

    CONSTRAINT "HazardReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HazardRiskAssessmentSubmission_templateKey_idx" ON "HazardRiskAssessmentSubmission"("templateKey");

-- CreateIndex
CREATE INDEX "HazardRiskAssessmentSubmission_submittedById_idx" ON "HazardRiskAssessmentSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "HazardRiskAssessmentSubmission_status_idx" ON "HazardRiskAssessmentSubmission"("status");

-- CreateIndex
CREATE INDEX "HazardRiskAssessmentSubmission_jobId_idx" ON "HazardRiskAssessmentSubmission"("jobId");

-- CreateIndex
CREATE INDEX "HazardRiskAssessmentSubmission_createdAt_idx" ON "HazardRiskAssessmentSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "HazardReviewComment_authorId_idx" ON "HazardReviewComment"("authorId");

-- CreateIndex
CREATE INDEX "HazardReviewComment_createdAt_idx" ON "HazardReviewComment"("createdAt");

-- CreateIndex
CREATE INDEX "HazardReviewComment_templateKey_idx" ON "HazardReviewComment"("templateKey");

-- AddForeignKey
ALTER TABLE "HazardRiskAssessmentSubmission" ADD CONSTRAINT "HazardRiskAssessmentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardRiskAssessmentSubmission" ADD CONSTRAINT "HazardRiskAssessmentSubmission_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardReviewComment" ADD CONSTRAINT "HazardReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardReviewComment" ADD CONSTRAINT "HazardReviewComment_hrRemarkById_fkey" FOREIGN KEY ("hrRemarkById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
