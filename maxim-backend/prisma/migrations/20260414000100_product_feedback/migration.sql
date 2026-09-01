-- CreateTable (initial ProductFeedback; completed flags added in next migration)
CREATE TABLE "ProductFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "forwardedAt" TIMESTAMP(3),
    "forwardError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFeedback_userId_idx" ON "ProductFeedback"("userId");

-- CreateIndex
CREATE INDEX "ProductFeedback_createdAt_idx" ON "ProductFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductFeedback" ADD CONSTRAINT "ProductFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
