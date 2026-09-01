-- HR-managed training course catalog for certificate dropdowns / exports

CREATE TABLE IF NOT EXISTS "TrainingCourseType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingCourseType_name_key"
  ON "TrainingCourseType"("name");

CREATE INDEX IF NOT EXISTS "TrainingCourseType_isActive_isPrimary_sortOrder_idx"
  ON "TrainingCourseType"("isActive", "isPrimary", "sortOrder");

CREATE INDEX IF NOT EXISTS "TrainingCourseType_name_idx"
  ON "TrainingCourseType"("name");
