-- AlterEnum: novo status APROVADO (aprovação interna). Não é usado dentro desta migration.
ALTER TYPE "ContractStatus" ADD VALUE 'APROVADO';

-- CreateEnum
CREATE TYPE "ContractReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable: escritórios existentes continuam sem aprovação obrigatória.
ALTER TABLE "offices" ADD COLUMN "requireInternalApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: último ciclo de revisão interna do contrato.
ALTER TABLE "contracts" ADD COLUMN "reviewSubmittedAt" TIMESTAMP(3),
ADD COLUMN "reviewSubmittedById" TEXT,
ADD COLUMN "reviewDecision" "ContractReviewDecision",
ADD COLUMN "reviewDecidedAt" TIMESTAMP(3),
ADD COLUMN "reviewDecidedById" TEXT,
ADD COLUMN "reviewRejectionReason" TEXT;

-- AlterTable: motivo da versão (ex.: renovação).
ALTER TABLE "contract_versions" ADD COLUMN "changeNote" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_reviewSubmittedById_fkey" FOREIGN KEY ("reviewSubmittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_reviewDecidedById_fkey" FOREIGN KEY ("reviewDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
