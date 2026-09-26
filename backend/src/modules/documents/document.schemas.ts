import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

export const documentCategoryApiSchema = z.enum(['contrato', 'procuração', 'documento', 'outro']);

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  category: documentCategoryApiSchema.optional(),
  contractId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const documentIdParamsSchema = z.object({ id: z.string().uuid('ID de documento inválido') });
export type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;

/** Campos de texto que acompanham o arquivo no multipart/form-data
 * (não são validados por `validate()`, que só cobre JSON — ver document.controller.ts). */
export const uploadDocumentFieldsSchema = z.object({
  contractId: z.string().uuid('Contrato inválido'),
  category: documentCategoryApiSchema.optional(),
});
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;
