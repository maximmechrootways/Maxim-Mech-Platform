-- Add second emergency contact fields for employee profiles.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "emergencyContact2Name" TEXT,
ADD COLUMN IF NOT EXISTS "emergencyContact2Phone" TEXT;

