-- AlterTable: vincula um PDF gerado à ContractVersion que o originou.
-- Nullable: documentos existentes e uploads manuais continuam válidos.
ALTER TABLE "documents" ADD COLUMN "contractVersionId" TEXT;

-- CreateIndex: no máximo um PDF por versão (também serve de trava contra
-- geração concorrente da mesma versão).
CREATE UNIQUE INDEX "documents_contractVersionId_key" ON "documents"("contractVersionId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "contract_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
