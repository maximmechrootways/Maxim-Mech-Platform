-- Incoming invoice email ingestion (accounting@maximmech.com via isolated Composio project)

CREATE TABLE "IncomingInvoiceIngestionJob" (
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

    CONSTRAINT "IncomingInvoiceIngestionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncomingInvoiceIngestionJob_gmailMessageId_key" ON "IncomingInvoiceIngestionJob"("gmailMessageId");
CREATE INDEX "IncomingInvoiceIngestionJob_status_nextAttemptAt_idx" ON "IncomingInvoiceIngestionJob"("status", "nextAttemptAt");
CREATE INDEX "IncomingInvoiceIngestionJob_processingLockedAt_idx" ON "IncomingInvoiceIngestionJob"("processingLockedAt");

CREATE TABLE "IncomingInvoice" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "emailSubject" TEXT,
    "emailBodyText" TEXT,
    "emailBodyHtml" TEXT,
    "emailFrom" TEXT,
    "emailTo" TEXT,
    "receivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'READY',
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "vendorName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2),
    "taxAmount" DECIMAL(14,2),
    "totalAmount" DECIMAL(14,2),
    "currency" TEXT,
    "poNumber" TEXT,
    "jobReference" TEXT,
    "paymentTerms" TEXT,
    "extractedData" JSONB,
    "searchText" TEXT,
    "gmailLabeledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncomingInvoice_gmailMessageId_key" ON "IncomingInvoice"("gmailMessageId");
CREATE INDEX "IncomingInvoice_vendorName_idx" ON "IncomingInvoice"("vendorName");
CREATE INDEX "IncomingInvoice_invoiceNumber_idx" ON "IncomingInvoice"("invoiceNumber");
CREATE INDEX "IncomingInvoice_invoiceDate_idx" ON "IncomingInvoice"("invoiceDate");
CREATE INDEX "IncomingInvoice_totalAmount_idx" ON "IncomingInvoice"("totalAmount");
CREATE INDEX "IncomingInvoice_receivedAt_idx" ON "IncomingInvoice"("receivedAt");
CREATE INDEX "IncomingInvoice_status_idx" ON "IncomingInvoice"("status");
CREATE INDEX "IncomingInvoice_createdAt_idx" ON "IncomingInvoice"("createdAt");

CREATE TABLE "IncomingInvoiceAttachment" (
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

    CONSTRAINT "IncomingInvoiceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncomingInvoiceAttachment_invoiceId_idx" ON "IncomingInvoiceAttachment"("invoiceId");

ALTER TABLE "IncomingInvoiceAttachment" ADD CONSTRAINT "IncomingInvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "IncomingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IncomingInvoiceSyncCursor" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "processedLabelId" TEXT,
    "processedLabelName" TEXT NOT NULL DEFAULT 'Maxim/Processed',
    "composioTriggerId" TEXT,
    "connectedAccountId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingInvoiceSyncCursor_pkey" PRIMARY KEY ("id")
);
