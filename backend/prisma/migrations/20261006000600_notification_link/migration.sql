-- AlterTable: caminho relativo (ex.: /contratos/<id>) para abrir o contrato/pagamento a partir da notificação.
-- Nullable: notificações existentes continuam como estão.
ALTER TABLE "notifications" ADD COLUMN "link" TEXT;
