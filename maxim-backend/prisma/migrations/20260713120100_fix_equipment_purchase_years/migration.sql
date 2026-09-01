-- Normalize purchase years to midday UTC so local display matches the inventory year
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2008-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-jlg-600s';
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2017-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-skyjack-sjiii-4632';
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2009-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-genie-s60';
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2017-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-bobcat-e55';
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2008-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-genie-gth-1056';
UPDATE "Equipment" SET "dateOfPurchase" = TIMESTAMP '2013-01-01 12:00:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'eq-inv-genie-z60-34';
