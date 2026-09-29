-- AlterTable: senha provisória gerada no convite de usuário (ADMIN) deve ser trocada no primeiro acesso.
-- Usuários existentes recebem false: nenhuma troca é forçada retroativamente.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
