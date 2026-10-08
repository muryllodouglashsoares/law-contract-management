-- CreateEnum
CREATE TYPE "PaymentAlertType" AS ENUM ('BEFORE_3_DAYS', 'DUE_TODAY', 'AFTER_1_DAY');

-- AlterTable: Pix copia e cola (informativo; a baixa continua manual). Colunas nullable: pagamentos antigos não mudam.
ALTER TABLE "payments" ADD COLUMN "pixCode" TEXT,
ADD COLUMN "pixKey" TEXT,
ADD COLUMN "pixInstructions" TEXT;

-- CreateTable: alertas de pagamento já enviados (idempotência garantida pelo UNIQUE).
CREATE TABLE "payment_alert_events" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "PaymentAlertType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_alert_events_paymentId_type_key" ON "payment_alert_events"("paymentId", "type");

-- CreateIndex: job diário (status + janela de vencimento) e dashboard financeiro (office + status + vencimento).
CREATE INDEX "payments_officeId_status_dueDate_idx" ON "payments"("officeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "payments_status_dueDate_idx" ON "payments"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "payment_alert_events" ADD CONSTRAINT "payment_alert_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
