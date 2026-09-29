-- AlterTable: SHA-256 (hex) do conteúdo do PDF gerado, para comprovar integridade depois.
-- Nullable: uploads manuais e documentos antigos continuam válidos sem hash.
ALTER TABLE "documents" ADD COLUMN "contentHash" CHAR(64);

-- Garante o formato: 64 caracteres hexadecimais minúsculos (ou NULL).
ALTER TABLE "documents" ADD CONSTRAINT "documents_contentHash_format_check"
  CHECK ("contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$');
