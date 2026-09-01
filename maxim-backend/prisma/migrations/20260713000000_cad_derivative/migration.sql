-- CreateTable
CREATE TABLE IF NOT EXISTS "CadDerivative" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentSha256" TEXT,
    "objectKey" TEXT,
    "urn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadDerivative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CadDerivative_sourceKey_key" ON "CadDerivative"("sourceKey");
CREATE INDEX IF NOT EXISTS "CadDerivative_status_idx" ON "CadDerivative"("status");
