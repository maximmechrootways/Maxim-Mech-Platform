-- Allow employee-linked certificates without an expiration date.
ALTER TABLE "Certificate" ALTER COLUMN "expirationDate" DROP NOT NULL;
