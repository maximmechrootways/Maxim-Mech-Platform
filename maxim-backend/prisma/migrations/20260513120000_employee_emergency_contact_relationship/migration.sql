-- Relationship of each emergency contact to the employee (e.g. spouse, parent).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyContactRelationship" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyContact2Relationship" TEXT;
