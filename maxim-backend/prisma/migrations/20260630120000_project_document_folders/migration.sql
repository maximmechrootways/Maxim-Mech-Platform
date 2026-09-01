-- User-created folders for project documents (per job, optional nesting).

CREATE TABLE "ProjectDocumentFolder" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectDocumentFolder_jobId_idx" ON "ProjectDocumentFolder"("jobId");
CREATE INDEX "ProjectDocumentFolder_parentId_idx" ON "ProjectDocumentFolder"("parentId");

ALTER TABLE "ProjectDocumentFolder" ADD CONSTRAINT "ProjectDocumentFolder_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectDocumentFolder" ADD CONSTRAINT "ProjectDocumentFolder_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ProjectDocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectDocumentFolder" ADD CONSTRAINT "ProjectDocumentFolder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LibraryDocument" ADD COLUMN "folderId" TEXT;

CREATE INDEX "LibraryDocument_folderId_idx" ON "LibraryDocument"("folderId");

ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "ProjectDocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
