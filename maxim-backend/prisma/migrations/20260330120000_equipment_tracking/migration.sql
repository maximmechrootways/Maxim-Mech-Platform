-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "tag" TEXT,
    "manufacturer" TEXT,
    "siteId" TEXT,
    "maintenanceSchedule" TEXT NOT NULL DEFAULT 'monthly',
    "costAtPurchase" DECIMAL(14,2),
    "dateOfPurchase" TIMESTAMP(3),
    "inspectionSubmissionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMaintenanceRecord" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "hoursAtLastMaintenance" DECIMAL(14,2),
    "mileage" DECIMAL(14,2),
    "descriptionOfWork" TEXT,
    "partsReplacedOrRepaired" TEXT,
    "technicianNameOrNumber" TEXT,
    "maintenanceCompany" TEXT,
    "dateMaintenanceRequired" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentMaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentCostEntry" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "maintenancePerformed" TEXT,
    "labourCost" DECIMAL(14,2),
    "materialCost" DECIMAL(14,2),
    "warrantyCovered" BOOLEAN NOT NULL DEFAULT false,
    "totalCost" DECIMAL(14,2),
    "invoiceFilePath" TEXT,
    "invoiceOriginalName" TEXT,
    "invoiceMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentInsurance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "policyOrCertificate" TEXT,
    "expiryDate" TEXT,
    "policyFilePath" TEXT,
    "policyOriginalName" TEXT,
    "policyMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_siteId_idx" ON "Equipment"("siteId");

-- CreateIndex
CREATE INDEX "Equipment_name_idx" ON "Equipment"("name");

-- CreateIndex
CREATE INDEX "EquipmentMaintenanceRecord_equipmentId_idx" ON "EquipmentMaintenanceRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentCostEntry_equipmentId_idx" ON "EquipmentCostEntry"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentInsurance_equipmentId_idx" ON "EquipmentInsurance"("equipmentId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMaintenanceRecord" ADD CONSTRAINT "EquipmentMaintenanceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCostEntry" ADD CONSTRAINT "EquipmentCostEntry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentInsurance" ADD CONSTRAINT "EquipmentInsurance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
