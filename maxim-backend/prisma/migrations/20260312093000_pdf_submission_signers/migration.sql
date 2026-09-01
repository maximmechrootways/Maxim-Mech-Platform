-- Add signer tracking to PDF submissions
ALTER TABLE "PdfSubmission"
ADD COLUMN "pdfBlobPath" TEXT,
ADD COLUMN "finalPdfBlobPath" TEXT,
ADD COLUMN "finalizedAt" TIMESTAMP(3);

CREATE TABLE "PdfSubmissionSigner" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "labourerUserId" TEXT NOT NULL,
    "signatureStatus" TEXT NOT NULL DEFAULT 'pending',
    "signatureImageData" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfSubmissionSigner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PdfSubmissionSigner_submissionId_labourerUserId_key"
ON "PdfSubmissionSigner"("submissionId", "labourerUserId");

CREATE INDEX "PdfSubmissionSigner_submissionId_idx" ON "PdfSubmissionSigner"("submissionId");
CREATE INDEX "PdfSubmissionSigner_labourerUserId_idx" ON "PdfSubmissionSigner"("labourerUserId");
CREATE INDEX "PdfSubmissionSigner_signatureStatus_idx" ON "PdfSubmissionSigner"("signatureStatus");

ALTER TABLE "PdfSubmissionSigner"
ADD CONSTRAINT "PdfSubmissionSigner_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "PdfSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PdfSubmissionSigner"
ADD CONSTRAINT "PdfSubmissionSigner_labourerUserId_fkey"
FOREIGN KEY ("labourerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
