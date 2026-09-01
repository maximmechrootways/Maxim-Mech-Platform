-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT,
    "incidentType" TEXT,
    "severityLevel" INTEGER,
    "equipmentInvolved" TEXT,
    "description" TEXT,
    "reportedById" TEXT,
    "reportedBy" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NearMiss" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "followUpNotes" TEXT,

    CONSTRAINT "NearMiss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT NOT NULL,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "dueDate" TEXT,
    "closedAt" TIMESTAMP(3),
    "likelihood" INTEGER,
    "impact" INTEGER,
    "riskLevel" TEXT,
    "recommendedControls" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HazardReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyObservation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observedBy" TEXT NOT NULL,
    "observedById" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT,

    CONSTRAINT "SafetyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyAlert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "siteNames" JSONB NOT NULL DEFAULT '[]',
    "roles" JSONB NOT NULL DEFAULT '[]',
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TEXT,
    "acknowledgedBy" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SafetyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSchedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT,
    "checklistId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDue" TEXT NOT NULL,
    "assignedToRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "siteId" TEXT,
    "siteName" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "completedBy" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "submissionId" TEXT,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCalendarEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "siteName" TEXT,
    "recordId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "linkTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRTodoItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "dueTime" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "linkTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HRTodoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "linkTo" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_siteId_idx" ON "Incident"("siteId");
CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_date_idx" ON "Incident"("date");

-- CreateIndex
CREATE INDEX "NearMiss_siteId_idx" ON "NearMiss"("siteId");
CREATE INDEX "NearMiss_status_idx" ON "NearMiss"("status");

-- CreateIndex
CREATE INDEX "HazardReport_siteId_idx" ON "HazardReport"("siteId");
CREATE INDEX "HazardReport_status_idx" ON "HazardReport"("status");

-- CreateIndex
CREATE INDEX "SafetyObservation_siteId_idx" ON "SafetyObservation"("siteId");
CREATE INDEX "SafetyObservation_type_idx" ON "SafetyObservation"("type");

-- CreateIndex
CREATE INDEX "CorrectiveAction_sourceType_sourceId_idx" ON "CorrectiveAction"("sourceType", "sourceId");
CREATE INDEX "CorrectiveAction_status_idx" ON "CorrectiveAction"("status");
CREATE INDEX "CorrectiveAction_dueDate_idx" ON "CorrectiveAction"("dueDate");

-- CreateIndex
CREATE INDEX "SafetyAlert_publishedAt_idx" ON "SafetyAlert"("publishedAt");

-- CreateIndex
CREATE INDEX "InspectionSchedule_nextDue_idx" ON "InspectionSchedule"("nextDue");

-- CreateIndex
CREATE INDEX "InspectionResult_scheduleId_idx" ON "InspectionResult"("scheduleId");
CREATE INDEX "InspectionResult_completedAt_idx" ON "InspectionResult"("completedAt");

-- CreateIndex
CREATE INDEX "ComplianceCalendarEvent_dueDate_idx" ON "ComplianceCalendarEvent"("dueDate");
CREATE INDEX "ComplianceCalendarEvent_type_idx" ON "ComplianceCalendarEvent"("type");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "HRTodoItem_userId_idx" ON "HRTodoItem"("userId");
CREATE INDEX "HRTodoItem_dueDate_idx" ON "HRTodoItem"("dueDate");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_read_idx" ON "Notification"("read");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
