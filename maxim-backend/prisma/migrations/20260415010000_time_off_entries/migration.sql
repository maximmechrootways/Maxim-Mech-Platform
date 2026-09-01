-- CreateTable
CREATE TABLE "TimeOffEntry" (
    "id" TEXT NOT NULL,
    "labourerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOffEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOffEntry_labourerId_idx" ON "TimeOffEntry"("labourerId");

-- CreateIndex
CREATE INDEX "TimeOffEntry_createdById_idx" ON "TimeOffEntry"("createdById");

-- CreateIndex
CREATE INDEX "TimeOffEntry_startDate_idx" ON "TimeOffEntry"("startDate");

-- CreateIndex
CREATE INDEX "TimeOffEntry_endDate_idx" ON "TimeOffEntry"("endDate");

-- CreateIndex
CREATE INDEX "TimeOffEntry_createdAt_idx" ON "TimeOffEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "TimeOffEntry" ADD CONSTRAINT "TimeOffEntry_labourerId_fkey" FOREIGN KEY ("labourerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffEntry" ADD CONSTRAINT "TimeOffEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
