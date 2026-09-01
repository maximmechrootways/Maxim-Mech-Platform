-- EmployeeDocument: columns referenced by Prisma schema (training metadata).
-- Without these, any prisma.employeeDocument.* call fails against an older DB.
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "hoursCompleted" DOUBLE PRECISION;
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "trainingFacility" TEXT;
