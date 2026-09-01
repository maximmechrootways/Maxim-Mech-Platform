-- CreateTable
CREATE TABLE "ProductFeedbackComment" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFeedbackComment_feedbackId_createdAt_idx" ON "ProductFeedbackComment"("feedbackId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductFeedbackComment_authorId_idx" ON "ProductFeedbackComment"("authorId");

-- CreateIndex
CREATE INDEX "ProductFeedbackComment_createdAt_idx" ON "ProductFeedbackComment"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductFeedbackComment" ADD CONSTRAINT "ProductFeedbackComment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ProductFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFeedbackComment" ADD CONSTRAINT "ProductFeedbackComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
