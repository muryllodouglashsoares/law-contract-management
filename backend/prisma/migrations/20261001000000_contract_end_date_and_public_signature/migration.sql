-- AlterTable: data de término (nullable — contratos existentes não são afetados)
-- e controle de idempotência do alerta de renovação.
ALTER TABLE "contracts" ADD COLUMN "endDate" TIMESTAMP(3),
ADD COLUMN "renewalAlertSentAt" TIMESTAMP(3),
ADD COLUMN "renewalAlertForEndDate" TIMESTAMP(3);

-- CreateIndex: consultas de contratos próximos do vencimento (officeId + janela de endDate).
CREATE INDEX "contracts_officeId_endDate_idx" ON "contracts"("officeId", "endDate");

-- CreateTable: aceite eletrônico por link público de uso único.
CREATE TABLE "contract_public_signatures" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerDocument" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "consentTextVersion" TEXT,
    "signatureHash" CHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_public_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_public_signatures_tokenHash_key" ON "contract_public_signatures"("tokenHash");

-- CreateIndex
CREATE INDEX "contract_public_signatures_contractId_idx" ON "contract_public_signatures"("contractId");

-- CreateIndex
CREATE INDEX "contract_public_signatures_officeId_idx" ON "contract_public_signatures"("officeId");

-- CreateIndex
CREATE INDEX "contract_public_signatures_expiresAt_idx" ON "contract_public_signatures"("expiresAt");

-- AddForeignKey
ALTER TABLE "contract_public_signatures" ADD CONSTRAINT "contract_public_signatures_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_public_signatures" ADD CONSTRAINT "contract_public_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_public_signatures" ADD CONSTRAINT "contract_public_signatures_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "contract_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_public_signatures" ADD CONSTRAINT "contract_public_signatures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
