-- CreateEnum
CREATE TYPE "SignatureLinkAlertType" AS ENUM ('SIGNATURE_NEVER_OPENED', 'SIGNATURE_EXPIRING');

-- AlterTable: rastreamento de abertura da página pública (links existentes: openCount = 0, datas nulas).
ALTER TABLE "contract_public_signatures" ADD COLUMN "firstOpenedAt" TIMESTAMP(3),
ADD COLUMN "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: PDF final com comprovante de aceite, ligado ao evento de assinatura (no máximo 1 por assinatura).
ALTER TABLE "documents" ADD COLUMN "signatureId" TEXT;

-- CreateTable: alertas de link de assinatura já enviados (idempotência garantida pelo UNIQUE).
CREATE TABLE "signature_link_alerts" (
    "id" TEXT NOT NULL,
    "signatureId" TEXT NOT NULL,
    "type" "SignatureLinkAlertType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_link_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_signatureId_key" ON "documents"("signatureId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_link_alerts_signatureId_type_key" ON "signature_link_alerts"("signatureId", "type");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "contract_public_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_link_alerts" ADD CONSTRAINT "signature_link_alerts_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "contract_public_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
