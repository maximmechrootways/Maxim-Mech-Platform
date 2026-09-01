-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "compensation" TEXT NOT NULL DEFAULT 'paid',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "timeOffEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeOffRequest_timeOffEntryId_key" ON "TimeOffRequest"("timeOffEntryId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_requesterId_idx" ON "TimeOffRequest"("requesterId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_status_idx" ON "TimeOffRequest"("status");

-- CreateIndex
CREATE INDEX "TimeOffRequest_startDate_idx" ON "TimeOffRequest"("startDate");

-- CreateIndex
CREATE INDEX "TimeOffRequest_createdAt_idx" ON "TimeOffRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_timeOffEntryId_fkey" FOREIGN KEY ("timeOffEntryId") REFERENCES "TimeOffEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
