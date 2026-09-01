-- CreateTable
CREATE TABLE "HazardReviewCustomDocument" (
    "id" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardReviewCustomDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HazardReviewCustomDocument_uploadedById_idx" ON "HazardReviewCustomDocument"("uploadedById");

-- AddForeignKey
ALTER TABLE "HazardReviewCustomDocument" ADD CONSTRAINT "HazardReviewCustomDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
