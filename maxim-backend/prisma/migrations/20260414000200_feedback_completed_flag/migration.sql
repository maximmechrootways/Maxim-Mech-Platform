-- Ensure ProductFeedback exists even if prior migration was marked applied incorrectly.
CREATE TABLE IF NOT EXISTS "ProductFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "forwardedAt" TIMESTAMP(3),
    "forwardError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductFeedback" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductFeedback" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ProductFeedback_userId_idx" ON "ProductFeedback"("userId");
CREATE INDEX IF NOT EXISTS "ProductFeedback_createdAt_idx" ON "ProductFeedback"("createdAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductFeedback_userId_fkey') THEN
    ALTER TABLE "ProductFeedback"
      ADD CONSTRAINT "ProductFeedback_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
