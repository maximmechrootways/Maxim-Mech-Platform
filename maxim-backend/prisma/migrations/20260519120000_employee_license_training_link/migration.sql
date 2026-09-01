-- Licences (employee-only) and training ↔ global certificate linking
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT;
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "certificateId" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "employeeDocumentId" TEXT;

CREATE INDEX IF NOT EXISTS "EmployeeDocument_certificateId_idx" ON "EmployeeDocument"("certificateId");
CREATE INDEX IF NOT EXISTS "Certificate_employeeDocumentId_idx" ON "Certificate"("employeeDocumentId");
