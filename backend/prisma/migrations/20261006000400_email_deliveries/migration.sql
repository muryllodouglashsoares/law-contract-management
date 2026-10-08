-- CreateEnum
CREATE TYPE "EmailDeliveryType" AS ENUM ('SIGNATURE_LINK', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable: registro de entrega (sem corpo da mensagem e sem token/link de assinatura).
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "createdById" TEXT,
    "contractId" TEXT,
    "recipient" TEXT NOT NULL,
    "type" "EmailDeliveryType" NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_deliveries_officeId_createdAt_idx" ON "email_deliveries"("officeId", "createdAt");

-- CreateIndex
CREATE INDEX "email_deliveries_contractId_idx" ON "email_deliveries"("contractId");

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
