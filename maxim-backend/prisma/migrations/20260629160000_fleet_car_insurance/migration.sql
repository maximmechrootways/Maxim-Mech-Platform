-- Fleet automobile insurance (company-wide, under Equipment)
CREATE TABLE "FleetCarInsurancePolicy" (
    "id" TEXT NOT NULL DEFAULT 'fleet-default',
    "insurerName" TEXT,
    "policyNumber" TEXT,
    "transactionType" TEXT,
    "effectiveDate" TEXT,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "numberOfAutomobiles" INTEGER,
    "premium" DECIMAL(14,2),
    "paymentMethod" TEXT,
    "insuredName" TEXT,
    "insuredAddress" TEXT,
    "brokerName" TEXT,
    "brokerId" TEXT,
    "brokerAddress" TEXT,
    "brokerPhone" TEXT,
    "remarks" TEXT,
    "liabilityLimit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetCarInsurancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FleetCarInsuranceVehicle" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL DEFAULT 'fleet-default',
    "autoNo" INTEGER NOT NULL,
    "modelYear" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "newCostIncludingEquipment" DECIMAL(14,2),
    "vin" TEXT,
    "location" TEXT,
    "ratingClass" TEXT,
    "rateGroupAb" TEXT,
    "rateGroupCompSp" TEXT,
    "rateGroupDcPd" TEXT,
    "rateGroupColAp" TEXT,
    "liabilityBodilyInjuryPrem" DECIMAL(14,2),
    "liabilityPropertyDamagePrem" DECIMAL(14,2),
    "basicAccidentBenefitsPrem" DECIMAL(14,2),
    "uninsuredAutomobilePrem" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetCarInsuranceVehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FleetCarInsuranceVehicle_policyId_autoNo_key" ON "FleetCarInsuranceVehicle"("policyId", "autoNo");
CREATE INDEX "FleetCarInsuranceVehicle_policyId_idx" ON "FleetCarInsuranceVehicle"("policyId");

ALTER TABLE "FleetCarInsuranceVehicle" ADD CONSTRAINT "FleetCarInsuranceVehicle_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "FleetCarInsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FleetCarInsurancePolicy" (
    "id", "insurerName", "policyNumber", "transactionType", "effectiveDate",
    "periodStart", "periodEnd", "numberOfAutomobiles", "premium", "paymentMethod",
    "insuredName", "insuredAddress", "brokerName", "brokerId", "brokerAddress",
    "brokerPhone", "remarks", "liabilityLimit", "updatedAt"
) VALUES (
    'fleet-default',
    'Gore Mutual Insurance Company',
    'GF9733517106',
    'PolicyChange',
    '2026-05-17',
    '2026-05-17 12:01',
    '2027-05-17 12:01',
    8,
    1109.00,
    'Direct Bill, One Pay Payment Plan',
    'Maxim Mechanical Group Inc.',
    '42 Nobleton Lakes Drive, Nobleton ON L0G 1N0',
    'Northbrook Insurance Group Inc.',
    '3463',
    '151 Applewood Cres, Unit 1, Concord ON L4K 4E3',
    '905-850-6633',
    'Remove 09'' Chrysler VIN... 03468',
    '$2,000,000',
    CURRENT_TIMESTAMP
);

INSERT INTO "FleetCarInsuranceVehicle" (
    "id", "policyId", "autoNo", "modelYear", "make", "model", "newCostIncludingEquipment",
    "vin", "location", "ratingClass", "rateGroupAb", "rateGroupCompSp", "rateGroupDcPd", "rateGroupColAp",
    "liabilityBodilyInjuryPrem", "liabilityPropertyDamagePrem", "basicAccidentBenefitsPrem", "uninsuredAutomobilePrem",
    "sortOrder", "updatedAt"
) VALUES
('fciv-1', 'fleet-default', 1, 2015, 'GMC', 'SAVANA 2500 CARGO VAN', 36787.00, '1GTW7FCF4F1270943', '15', '36', '13', '13', '13', '13', 431.00, 25.00, 173.00, 23.00, 1, CURRENT_TIMESTAMP),
('fciv-2', 'fleet-default', 2, 2015, 'GMC', 'SAVANA 2500 CARGO VAN', 36787.00, '1GTW7FCF1F1259124', '15', '36', '13', '13', '13', '13', 431.00, 25.00, 173.00, 23.00, 2, CURRENT_TIMESTAMP),
('fciv-3', 'fleet-default', 3, 2020, 'CADILLAC', 'ESCALADE 4DR 4WD', 77000.00, '1GYS4AKJ0LR112588', '15', '07', '29', '79', '50', '50', 249.00, 14.00, 277.00, 6.00, 3, CURRENT_TIMESTAMP),
('fciv-4', 'fleet-default', 4, 2016, 'CADILLAC', 'SRX V6 4DR AWD', NULL, '3GYFNEE36GS578452', '15', '07', '31', '34', '38', '38', 260.00, 15.00, 314.00, 7.00, 4, CURRENT_TIMESTAMP),
('fciv-5', 'fleet-default', 5, 2016, 'DODGE/RAM', 'RAM 1500 ST QUAD CAB 4WD', 41890.00, '1C6RR7FG3GS312801', '15', '36', '15', '15', '15', '15', 431.00, 25.00, 173.00, 23.00, 5, CURRENT_TIMESTAMP),
('fciv-6', 'fleet-default', 6, 2020, 'GMC', 'SAVANA 2500 CARGO VAN', NULL, '1GTW7AFG6L1184889', '15', '36', '15', '15', '15', '15', 431.00, 25.00, 173.00, 23.00, 6, CURRENT_TIMESTAMP),
('fciv-8', 'fleet-default', 8, 2014, 'GMC', 'SAVANA 2500 CARGO VAN', NULL, '1GTW7FBA2E1120544', '15', '36', '11', '11', '11', '11', 431.00, 25.00, 173.00, 23.00, 8, CURRENT_TIMESTAMP),
('fciv-9', 'fleet-default', 9, 2026, 'GMC', 'SIERRA 1500 DENALI CREW CAB 4WD', 89499.00, '3GTUUGED9TG112404', '15', '36', '28', '28', '28', '28', 431.00, 25.00, 173.00, 23.00, 9, CURRENT_TIMESTAMP);
