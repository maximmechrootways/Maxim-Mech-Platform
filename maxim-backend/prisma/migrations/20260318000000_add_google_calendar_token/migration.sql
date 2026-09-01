-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleCalendarRefreshToken" TEXT,
ADD COLUMN "googleCalendarConnectedAt" TIMESTAMP(3);
