-- Who performed clock-in / clock-out (accountability when Owner or HR acts for someone).

ALTER TABLE "EmployeeWorkSession" ADD COLUMN "clockInByUserId" TEXT,
ADD COLUMN "clockOutByUserId" TEXT;

ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_clockInByUserId_fkey" FOREIGN KEY ("clockInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeWorkSession" ADD CONSTRAINT "EmployeeWorkSession_clockOutByUserId_fkey" FOREIGN KEY ("clockOutByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
