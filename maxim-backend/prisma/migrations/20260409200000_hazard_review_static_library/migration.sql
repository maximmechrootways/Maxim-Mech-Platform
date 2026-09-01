-- CreateTable
CREATE TABLE "HazardReviewStaticPdfOverride" (
    "templateKey" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardReviewStaticPdfOverride_pkey" PRIMARY KEY ("templateKey")
);

-- CreateTable
CREATE TABLE "HazardReviewStaticTemplateHidden" (
    "templateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HazardReviewStaticTemplateHidden_pkey" PRIMARY KEY ("templateKey")
);
