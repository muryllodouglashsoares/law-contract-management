import type { Document } from '@prisma/client';

import { DOCUMENT_CATEGORY_TO_API } from '../domain/status-map';

export type DocumentWithRelations = Document & {
  contract: { id: string; number: number; client: { id: string; name: string } };
  uploadedBy: { id: string; name: string };
  contractVersion: { versionNumber: number } | null;
};

export interface PublicDocument {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  contract: { id: string; number: number; client: { id: string; name: string } };
  uploadedBy: { id: string; name: string };
  /** Versão do contrato que originou este PDF; null em uploads manuais. */
  versionNumber: number | null;
  createdAt: string;
}

export function toPublicDocument(document: DocumentWithRelations): PublicDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    fileType: document.fileType,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    category: DOCUMENT_CATEGORY_TO_API(document.category),
    contract: document.contract,
    uploadedBy: document.uploadedBy,
    versionNumber: document.contractVersion?.versionNumber ?? null,
    createdAt: document.createdAt.toISOString(),
  };
}
