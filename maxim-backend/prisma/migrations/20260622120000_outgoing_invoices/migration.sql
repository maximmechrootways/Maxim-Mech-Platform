-- CreateTable
CREATE TABLE "OutgoingInvoiceIngestionJob" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "triggerPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingLockedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "ignoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingInvoiceIngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingInvoice" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "sourceSequence" INTEGER NOT NULL DEFAULT 0,
    "gmailThreadId" TEXT,
    "emailSubject" TEXT,
    "emailBodyText" TEXT,
    "emailBodyHtml" TEXT,
    "emailFrom" TEXT,
    "emailTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "customerName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2),
    "taxAmount" DECIMAL(14,2),
    "totalAmount" DECIMAL(14,2),
    "paidAmount" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'CAD',
    "orderNumber" TEXT,
    "supplierNumber" TEXT,
    "projectName" TEXT,
    "jobId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "notes" TEXT,
    "extractedData" JSONB,
    "searchText" TEXT,
    "gmailLabeledAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingInvoiceAttachment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "attachmentIndex" INTEGER NOT NULL DEFAULT 0,
    "gmailAttachmentId" TEXT,
    "filePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "ocrText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutgoingInvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingInvoiceSyncCursor" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "processedLabelId" TEXT,
    "processedLabelName" TEXT NOT NULL DEFAULT 'Maxim/OutgoingProcessed',
    "composioTriggerId" TEXT,
    "connectedAccountId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingInvoiceSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingInvoiceIngestionJob_gmailMessageId_key" ON "OutgoingInvoiceIngestionJob"("gmailMessageId");

-- CreateIndex
CREATE INDEX "OutgoingInvoiceIngestionJob_status_nextAttemptAt_idx" ON "OutgoingInvoiceIngestionJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutgoingInvoiceIngestionJob_processingLockedAt_idx" ON "OutgoingInvoiceIngestionJob"("processingLockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingInvoice_gmailMessageId_sourceSequence_key" ON "OutgoingInvoice"("gmailMessageId", "sourceSequence");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_customerName_idx" ON "OutgoingInvoice"("customerName");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_invoiceNumber_idx" ON "OutgoingInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_invoiceDate_idx" ON "OutgoingInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_dueDate_idx" ON "OutgoingInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_totalAmount_idx" ON "OutgoingInvoice"("totalAmount");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_sentAt_idx" ON "OutgoingInvoice"("sentAt");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_status_idx" ON "OutgoingInvoice"("status");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_createdAt_idx" ON "OutgoingInvoice"("createdAt");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_jobId_idx" ON "OutgoingInvoice"("jobId");

-- CreateIndex
CREATE INDEX "OutgoingInvoice_paidAt_idx" ON "OutgoingInvoice"("paidAt");

-- CreateIndex
CREATE INDEX "OutgoingInvoiceAttachment_invoiceId_idx" ON "OutgoingInvoiceAttachment"("invoiceId");

-- AddForeignKey
ALTER TABLE "OutgoingInvoice" ADD CONSTRAINT "OutgoingInvoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingInvoiceAttachment" ADD CONSTRAINT "OutgoingInvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "OutgoingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
